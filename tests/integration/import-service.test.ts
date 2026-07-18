import { existsSync, rmSync } from 'node:fs';
import { resolve } from 'node:path';

import sharp from 'sharp';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

import { resetDatabaseForTests } from '@/lib/db/client';
import { LocalOcrError } from '@/lib/ocr/local-ocr';
import { getHouseholdState, completeSetup } from '@/lib/services/household-service';
import {
  confirmImportOperation,
  createImportOperation,
  getImportArtifact,
  listImportOperations,
  resetImportRateLimitsForTests,
  setImportScanOcrRecognizerForTests,
} from '@/lib/services/import-service';
import { getRecipe } from '@/lib/services/recipe-service';

function recipePdf(text: string): Uint8Array {
  const commands = text
    .split('\n')
    .map((line, index) => `${index ? '0 -20 Td ' : ''}(${line.replace(/[()\\]/g, '\\$&')}) Tj`)
    .join(' ');
  const stream = `BT /F1 16 Tf 72 720 Td ${commands} ET`;
  const objects = [
    '<< /Type /Catalog /Pages 2 0 R >>',
    '<< /Type /Pages /Kids [3 0 R] /Count 1 >>',
    '<< /Type /Page /Parent 2 0 R /Resources << /Font << /F1 4 0 R >> >> /MediaBox [0 0 612 792] /Contents 5 0 R >>',
    '<< /Type /Font /Subtype /Type1 /BaseFont /Helvetica >>',
    `<< /Length ${Buffer.byteLength(stream)} >>\nstream\n${stream}\nendstream`,
  ];
  let document = '%PDF-1.4\n';
  const offsets = [0];
  objects.forEach((object, index) => {
    offsets.push(Buffer.byteLength(document));
    document += `${index + 1} 0 obj\n${object}\nendobj\n`;
  });
  const startXref = Buffer.byteLength(document);
  document += `xref\n0 ${objects.length + 1}\n0000000000 65535 f \n`;
  document += offsets
    .slice(1)
    .map((offset) => `${String(offset).padStart(10, '0')} 00000 n \n`)
    .join('');
  document += `trailer\n<< /Size ${objects.length + 1} /Root 1 0 R >>\nstartxref\n${startXref}\n%%EOF`;
  return new TextEncoder().encode(document);
}

describe('document import service', () => {
  beforeEach(() => {
    vi.stubEnv('DATABASE_URL', ':memory:');
    vi.stubEnv('DATA_DIR', './.test-data/imports');
    resetDatabaseForTests();
    resetImportRateLimitsForTests();
    setImportScanOcrRecognizerForTests(null);
  });

  afterEach(() => {
    resetDatabaseForTests();
    resetImportRateLimitsForTests();
    setImportScanOcrRecognizerForTests(null);
    rmSync(resolve(process.cwd(), '.test-data/imports'), { recursive: true, force: true });
    vi.unstubAllEnvs();
  });

  it('does not initialize the PDF runtime when creating an image review draft', async () => {
    const profile = completeSetup({
      householdName: 'Sunday suppers',
      appName: 'Our Recipes',
      profile: {
        displayName: 'Maya',
        color: '#637A45',
        avatarUrl: '',
        units: 'metric',
        temperatureUnit: 'C',
        locale: 'en-GB',
        timezone: 'Europe/London',
      },
    }).profiles[0]!;
    const scan = await sharp({
      create: { width: 4, height: 4, channels: 3, background: '#f5ecd6' },
    })
      .png()
      .toBuffer();

    expect(globalThis.DOMMatrix).toBeUndefined();
    await expect(
      createImportOperation({
        actorProfileId: profile.id,
        sourceName: 'recipe.png',
        bytes: scan,
        manualTranscription:
          'Lemon pasta\nIngredients\n2 tbsp olive oil\nMethod\n1. Toss the pasta with lemon.',
      }),
    ).resolves.toMatchObject({
      operation: { extractionMethod: 'manual-transcription', mediaType: 'image/webp' },
    });
    expect(globalThis.DOMMatrix).toBeUndefined();
  });

  it('extracts an embedded-text PDF, retains local provenance, and confirms only once', async () => {
    const profile = completeSetup({
      householdName: 'Sunday suppers',
      appName: 'Our Recipes',
      profile: {
        displayName: 'Maya',
        color: '#637A45',
        avatarUrl: '',
        units: 'imperial',
        temperatureUnit: 'F',
        locale: 'en-US',
        timezone: 'America/Los_Angeles',
      },
    }).profiles[0]!;

    const created = await createImportOperation({
      actorProfileId: profile.id,
      sourceName: '../../family tomato soup.pdf',
      bytes: recipePdf('Tomato soup\nIngredients\n2 tbsp olive oil\nMethod\n1. Simmer gently.'),
    });

    expect(created.operation.extractionMethod).toBe('pdf-text');
    expect(created.draft.recipe.title).toBe('Tomato soup');
    expect(created.operation.sourceName).toBe('family tomato soup.pdf');
    expect(
      existsSync(
        resolve(
          process.cwd(),
          '.test-data/imports/generated/imports',
          `${created.operation.id}.pdf`,
        ),
      ),
    ).toBe(true);
    await expect(getImportArtifact(created.operation.id)).resolves.toMatchObject({
      mediaType: 'application/pdf',
    });

    const confirmed = confirmImportOperation(
      created.operation.id,
      created.draft.recipe,
      profile.id,
    );
    expect(confirmed.operation.status).toBe('confirmed');
    expect(confirmed.operation.confirmedRecipeId).toBe(confirmed.recipe.id);
    expect(getRecipe(confirmed.recipe.id)?.createdByProfileId).toBe(profile.id);
    expect(() =>
      confirmImportOperation(created.operation.id, created.draft.recipe, profile.id),
    ).toThrow('already been confirmed');
    expect(getHouseholdState().profiles).toHaveLength(1);
  });

  it('creates a safe OpenAI vision-pending scan review without a transcription', async () => {
    const profile = completeSetup({
      householdName: 'Sunday suppers',
      appName: 'Our Recipes',
      profile: {
        displayName: 'Maya',
        color: '#637A45',
        avatarUrl: '',
        units: 'metric',
        temperatureUnit: 'C',
        locale: 'en-GB',
        timezone: 'Europe/London',
      },
    }).profiles[0]!;
    const scan = await sharp({
      create: { width: 4, height: 4, channels: 3, background: '#f5ecd6' },
    })
      .png()
      .toBuffer();
    const recognizer = vi.fn(async () => ({
      text: '',
      provenance: {
        modelId: 'tesseract-eng-4.0.0',
        runtimeVersion: '7.0.0',
        dataVersion: '1.0.0',
        engineVersion: null,
        aggregateConfidence: null,
      },
    }));
    setImportScanOcrRecognizerForTests(recognizer);

    const pendingVision = await createImportOperation({
      actorProfileId: profile.id,
      sourceName: 'recipe.png',
      bytes: scan,
      autoOpenAiVision: true,
    });
    expect(pendingVision.operation).toMatchObject({
      extractionMethod: 'openai-vision-pending',
      extractedText: '',
      mediaType: 'image/webp',
    });
    expect(pendingVision.draft.recipe.title).toBe('Untitled recipe');
    expect(pendingVision.operation.warnings.join(' ')).toContain('OpenAI vision review');
    expect(recognizer).not.toHaveBeenCalled();
    await expect(getImportArtifact(pendingVision.operation.id)).resolves.toMatchObject({
      mediaType: 'image/webp',
    });

    const created = await createImportOperation({
      actorProfileId: profile.id,
      sourceName: 'recipe-from-heic.jpg',
      bytes: scan,
      manualTranscription:
        'Lemon pasta\nIngredients\n2 tbsp olive oil\nMethod\n1. Toss the pasta with lemon.',
      clientConversions: [
        {
          originalSourceName: 'recipe-from-phone.heic',
          convertedSourceName: 'recipe-from-heic.jpg',
        },
      ],
    });
    expect(created.operation.mediaType).toBe('image/webp');
    expect(created.operation.warnings.join(' ')).toContain(
      'No file or text was sent to a network service',
    );
    expect(created.operation.warnings.join(' ')).toContain(
      'converted recipe-from-phone.heic to JPEG before upload',
    );
    const artifact = await getImportArtifact(created.operation.id);
    expect(artifact.bytes.subarray(0, 4).toString('ascii')).toBe('RIFF');
  });

  it('retains ordered normalized artifacts for a bounded multi-image scan set', async () => {
    const profile = completeSetup({
      householdName: 'Sunday suppers',
      appName: 'Our Recipes',
      profile: {
        displayName: 'Maya',
        color: '#637A45',
        avatarUrl: '',
        units: 'metric',
        temperatureUnit: 'C',
        locale: 'en-GB',
        timezone: 'Europe/London',
      },
    }).profiles[0]!;
    const front = await sharp({
      create: { width: 4, height: 4, channels: 3, background: '#f5ecd6' },
    })
      .png()
      .toBuffer();
    const back = await sharp({
      create: { width: 4, height: 4, channels: 3, background: '#637a45' },
    })
      .png()
      .toBuffer();

    const created = await createImportOperation({
      actorProfileId: profile.id,
      sources: [
        { sourceName: 'front.png', bytes: front },
        { sourceName: 'back.png', bytes: back },
      ],
      manualTranscription:
        'Garden pasta\nIngredients\n2 tbsp olive oil\nMethod\n1. Combine the scanned notes.',
    });

    expect(created.operation.artifacts).toHaveLength(2);
    expect(created.operation.artifacts.map((artifact) => artifact.sourceName)).toEqual([
      'front.png',
      'back.png',
    ]);
    expect(created.operation.artifacts.map((artifact) => artifact.position)).toEqual([0, 1]);
    const second = created.operation.artifacts[1]!;
    await expect(getImportArtifact(created.operation.id, second.id)).resolves.toMatchObject({
      mediaType: 'image/webp',
    });
  });

  it('uses deterministic local OCR only for an editable multi-image review draft', async () => {
    const profile = completeSetup({
      householdName: 'Sunday suppers',
      appName: 'Our Recipes',
      profile: {
        displayName: 'Maya',
        color: '#637A45',
        avatarUrl: '',
        units: 'metric',
        temperatureUnit: 'C',
        locale: 'en-GB',
        timezone: 'Europe/London',
      },
    }).profiles[0]!;
    const scan = await sharp({
      create: { width: 16, height: 16, channels: 3, background: '#f5ecd6' },
    })
      .png()
      .toBuffer();
    const recognizer = vi.fn(async (images: Buffer[]) => {
      expect(images).toHaveLength(2);
      expect(images.every((image) => image.subarray(0, 4).toString('ascii') === 'RIFF')).toBe(true);
      return {
        text: 'Tomato soup\nIngredients\n2 tomatoes\nMethod\n1. Simmer gently.',
        provenance: {
          modelId: 'tesseract-eng-4.0.0',
          runtimeVersion: '7.0.0',
          dataVersion: '1.0.0',
          engineVersion: '5.5.0',
          aggregateConfidence: 92,
        },
      };
    });
    setImportScanOcrRecognizerForTests(recognizer);

    const created = await createImportOperation({
      actorProfileId: profile.id,
      sources: [
        { sourceName: 'front.png', bytes: scan },
        { sourceName: 'back.png', bytes: scan },
      ],
    });

    expect(created.operation.extractionMethod).toBe('local-ocr');
    expect(created.operation.ocrProvenance).toMatchObject({
      modelId: 'tesseract-eng-4.0.0',
      aggregateConfidence: 92,
    });
    expect(created.operation.artifacts.map((artifact) => artifact.position)).toEqual([0, 1]);
    expect(created.operation.status).toBe('review');
    expect(created.draft.recipe.title).toBe('Tomato soup');
    expect(created.operation.warnings.join(' ')).toContain(
      'no file or text was sent to a network service',
    );
    expect(recognizer).toHaveBeenCalledTimes(1);

    const confirmed = confirmImportOperation(
      created.operation.id,
      created.draft.recipe,
      profile.id,
    );
    expect(confirmed.operation.status).toBe('confirmed');
  });

  it('returns a retryable OCR-busy outcome without storing a scan', async () => {
    const profile = completeSetup({
      householdName: 'Sunday suppers',
      appName: 'Our Recipes',
      profile: {
        displayName: 'Maya',
        color: '#637A45',
        avatarUrl: '',
        units: 'metric',
        temperatureUnit: 'C',
        locale: 'en-GB',
        timezone: 'Europe/London',
      },
    }).profiles[0]!;
    const scan = await sharp({
      create: { width: 16, height: 16, channels: 3, background: '#f5ecd6' },
    })
      .png()
      .toBuffer();
    setImportScanOcrRecognizerForTests(async () => {
      throw new LocalOcrError('busy');
    });

    await expect(
      createImportOperation({ actorProfileId: profile.id, sourceName: 'busy.png', bytes: scan }),
    ).rejects.toMatchObject({ code: 'ocr_busy' });
    expect(listImportOperations()).toHaveLength(0);
  });
});
