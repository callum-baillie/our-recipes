import { z } from 'zod';

import type { RecipeInput } from '@/lib/domain/recipe';

export const captureRequestSchema = z.discriminatedUnion('kind', [
  z.object({ kind: z.literal('text'), text: z.string().trim().min(20).max(100_000) }),
  z.object({
    kind: z.literal('url'),
    url: z.string().trim().url().max(2_048),
    candidateIndex: z.number().int().min(0).max(19).optional(),
  }),
]);

export type CaptureDraft = {
  recipe: RecipeInput;
  provenance: {
    kind: 'text' | 'url';
    sourceUrl: string | null;
    sourceName: string;
    extractionNotice: string;
    extractionMethod?:
      'pasted-text' | 'url-jsonld' | 'url-microdata' | 'url-open-graph' | 'url-text';
    warnings?: string[];
  };
  originalText: string;
};

export type CaptureCandidate = {
  index: number;
  title: string;
  summary: string;
  source: 'schema-jsonld' | 'microdata';
  warnings: string[];
};

function ingredient(line: string) {
  const match = line.trim().match(/^(?:(\d+(?:\.\d+)?|\d+\/\d+)\s*)?([a-zA-Z]+)?\s+(.+)$/);
  if (!match) return { quantity: '', unit: '', item: line.trim(), note: '' };
  const quantity = match[1]?.includes('/')
    ? Number(match[1].split('/')[0]) / Number(match[1].split('/')[1])
    : (match[1] ?? '');
  return { quantity, unit: match[2] ?? '', item: match[3] ?? line.trim(), note: '' };
}

export function draftFromText(
  text: string,
  source?: { url?: string; name?: string },
): CaptureDraft {
  const lines = text
    .replace(/\r/g, '')
    .split('\n')
    .map((line) => line.trim())
    .filter(Boolean);
  const ingredientStart = lines.findIndex((line) => /^ingredients?$/i.test(line));
  const methodStart = lines.findIndex((line) => /^(method|instructions?|directions?)$/i.test(line));
  const title = lines[0] ?? 'Untitled recipe';
  const ingredientLines =
    ingredientStart >= 0
      ? lines.slice(ingredientStart + 1, methodStart >= 0 ? methodStart : undefined)
      : lines.slice(1, Math.min(lines.length, 5));
  const stepLines =
    methodStart >= 0
      ? lines.slice(methodStart + 1).map((line) => line.replace(/^\d+[.)]\s*/, ''))
      : lines
          .slice(Math.max(1, ingredientLines.length + 1))
          .map((line) => line.replace(/^\d+[.)]\s*/, ''));
  const url = source?.url ?? '';
  return {
    recipe: {
      title,
      summary: '',
      servings: '4 servings',
      prepMinutes: 10,
      cookMinutes: 25,
      sourceName: source?.name ?? '',
      sourceUrl: url,
      tags: [],
      ingredientGroups: [
        {
          name: '',
          ingredients: (ingredientLines.length ? ingredientLines : ['Review ingredients']).map(
            ingredient,
          ),
        },
      ],
      instructionSections: [
        {
          title: '',
          steps: stepLines.length ? stepLines : ['Review and write the cooking method.'],
        },
      ],
    },
    provenance: {
      kind: url ? 'url' : 'text',
      sourceUrl: url || null,
      sourceName: source?.name ?? 'Pasted text',
      extractionMethod: url ? 'url-text' : 'pasted-text',
      warnings: [],
      extractionNotice:
        'This is a draft. Review every field before adding it to the shared cookbook.',
    },
    originalText: text.slice(0, 100_000),
  };
}
