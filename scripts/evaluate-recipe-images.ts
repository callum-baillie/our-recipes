/** Synthetic fixtures only. This utility does not mutate Bòrd recipes or select images. */
import { readFile, mkdir, writeFile } from 'node:fs/promises';
import { resolve } from 'node:path';
import { createHash } from 'node:crypto';
import OpenAI from 'openai';
import {
  recipeImagePrompt,
  RECIPE_IMAGE_PROMPT_VERSION,
  type AiImageGenerationInput,
} from '../src/lib/domain/recipe-image-generation';
async function main() {
  const args = process.argv.slice(2);
  function option(name: string) {
    const at = args.indexOf(name);
    return at < 0 ? undefined : args[at + 1];
  }
  const paid = args.includes('--paid');
  const dry = args.includes('--dry-run');
  const model = option('--model');
  const output = option('--output');
  const max = Number(option('--max-images') ?? 6);
  const quality = option('--quality') ?? 'low';
  const size = option('--size') ?? '1024x1024';
  if (
    paid === dry ||
    !model ||
    !output ||
    !Number.isInteger(max) ||
    max < 1 ||
    max > 6 ||
    !['low', 'medium', 'high'].includes(quality) ||
    !['1024x1024', '1536x1024', '1024x1536'].includes(size)
  )
    throw new Error(
      'Choose exactly --dry-run or --paid, --model, --output (new directory), --max-images 1–6, supported --quality and --size.',
    );
  if (
    paid &&
    (process.env.BORD_PAID_IMAGE_EVAL_AUTHORIZED !== 'yes' || !process.env.OPENAI_API_KEY)
  )
    throw new Error(
      'Paid evaluation requires explicit authorization and the server-side credential gate.',
    );
  const fixtures = JSON.parse(
    await readFile(resolve('tests/fixtures/ai/image-realism.json'), 'utf8'),
  ) as Array<AiImageGenerationInput & { id: string }>;
  const directory = resolve(output);
  await mkdir(directory, { recursive: false });
  const client = paid
    ? new OpenAI({ apiKey: process.env.OPENAI_API_KEY, maxRetries: 0, timeout: 120000 })
    : null;
  const manifest = {
    createdAt: new Date().toISOString(),
    status: dry ? 'dry-run' : 'in-progress',
    model,
    quality,
    size,
    promptVersion: RECIPE_IMAGE_PROMPT_VERSION,
    paidAuthorized: paid,
    estimatedCost: null,
    results: [] as Array<Record<string, unknown>>,
  };
  await writeFile(resolve(directory, 'manifest.json'), JSON.stringify(manifest, null, 2) + '\n');
  for (const fixture of fixtures.slice(0, max)) {
    const prompt = recipeImagePrompt(fixture);
    const record: Record<string, unknown> = {
      id: fixture.id,
      sourceDigest: createHash('sha256').update(JSON.stringify(fixture)).digest('hex'),
      promptDigest: createHash('sha256').update(prompt).digest('hex'),
      status: 'not-generated',
      scores: { recipeIdentity: null, physicalRealism: null, presentation: null, artifacts: null },
      reviewNotes: '',
    };
    manifest.results.push(record);
    await writeFile(resolve(directory, `${fixture.id}.prompt.txt`), prompt);
    if (client) {
      try {
        const result = await client.images.generate(
          {
            model,
            prompt,
            n: 1,
            quality: quality as 'low' | 'medium' | 'high',
            size: size as '1024x1024' | '1536x1024' | '1024x1536',
            output_format: 'webp',
          },
          { signal: AbortSignal.timeout(120000), maxRetries: 0 },
        );
        const bytes = result.data?.[0]?.b64_json;
        if (!bytes) throw new Error('No image returned.');
        const buffer = Buffer.from(bytes, 'base64');
        if (buffer.length > 15 * 1024 * 1024)
          throw new Error('Image exceeds the evaluation size bound.');
        await writeFile(resolve(directory, `${fixture.id}.webp`), buffer);
        record.status = 'generated-awaiting-human-review';
        record.file = `${fixture.id}.webp`;
      } catch {
        record.status = 'failed-or-outcome-unknown';
        manifest.status = 'stopped';
        await writeFile(
          resolve(directory, 'manifest.json'),
          JSON.stringify(manifest, null, 2) + '\n',
        );
        throw new Error(
          'Evaluation stopped after an unsuccessful request. Inspect the provider outcome before a deliberate retry; no request will be repeated automatically.',
        );
      }
    }
    await writeFile(resolve(directory, 'manifest.json'), JSON.stringify(manifest, null, 2) + '\n');
  }
  manifest.status = dry ? 'dry-run-complete' : 'awaiting-human-review';
  await writeFile(resolve(directory, 'manifest.json'), JSON.stringify(manifest, null, 2) + '\n');
  process.stdout.write(
    `${manifest.status}: ${manifest.results.length} synthetic fixtures in ${directory}\n`,
  );
}
main().catch((error) => {
  process.stderr.write(`${error instanceof Error ? error.message : 'Evaluation failed'}\n`);
  process.exitCode = 1;
});
