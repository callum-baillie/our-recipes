import { createHash } from 'node:crypto';
import { rmSync } from 'node:fs';
import { mkdir, readFile, rm, symlink, unlink, writeFile } from 'node:fs/promises';
import { resolve } from 'node:path';
import { t as listTar, x as extractTar } from 'tar';
import sharp from 'sharp';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

import { PORTABLE_RECIPE_EXPORT_FORMAT } from '@/lib/domain/recipe-export';
import { resetDatabaseForTests } from '@/lib/db/client';
import { completeSetup } from '@/lib/services/household-service';
import { createPortableRecipeExport } from '@/lib/services/portable-recipe-export-service';
import { createRecipeImage } from '@/lib/services/recipe-image-service';
import { createRecipe } from '@/lib/services/recipe-service';

const exportDataDirectory = resolve(process.cwd(), '.test-data/portable-recipe-export');
const extractionDirectory = resolve(process.cwd(), '.test-data/portable-recipe-export-extracted');

function checksum(bytes: Uint8Array): string {
  return createHash('sha256').update(bytes).digest('hex');
}

async function recipePhoto(): Promise<Buffer> {
  return sharp({
    create: { width: 24, height: 16, channels: 3, background: '#9f482f' },
  })
    .png()
    .toBuffer();
}

function setupProfile() {
  return completeSetup({
    householdName: 'Private Sunday suppers',
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
}

function createExportRecipe(profileId: string, title: string) {
  return createRecipe(
    {
      title,
      summary: 'A shareable recipe card.',
      servings: '4 servings',
      prepMinutes: 10,
      cookMinutes: 15,
      sourceName: 'Family notes',
      sourceUrl: 'https://example.test/recipe',
      tags: ['weeknight'],
      tips: 'Private kitchen tip that must stay local.',
      sharedNotes: 'Private household note that must stay local.',
      ingredientGroups: [
        { name: '', ingredients: [{ quantity: 2, unit: 'tbsp', item: 'olive oil', note: '' }] },
      ],
      instructionSections: [{ title: '', steps: ['Cook, taste, and serve.'] }],
    },
    profileId,
  );
}

describe('portable full recipe export', () => {
  beforeEach(() => {
    vi.stubEnv('DATA_DIR', './.test-data/portable-recipe-export');
    vi.stubEnv('DATABASE_URL', './.test-data/portable-recipe-export/our-recipes.db');
    resetDatabaseForTests();
  });

  afterEach(() => {
    resetDatabaseForTests();
    rmSync(exportDataDirectory, { recursive: true, force: true });
    rmSync(extractionDirectory, { recursive: true, force: true });
    vi.unstubAllEnvs();
  });

  it('creates a deterministic, checksummed JSON-LD and normalized-WebP archive without private data', async () => {
    const profile = setupProfile();
    const first = createExportRecipe(profile.id, 'Lemon pasta');
    const second = createExportRecipe(profile.id, 'Tomato soup');
    const photo = await recipePhoto();
    const firstImage = await createRecipeImage(
      first.id,
      profile.id,
      photo,
      'Lemon pasta in a bowl',
    );
    await createRecipeImage(second.id, profile.id, photo, 'Tomato soup in a bowl');

    const firstExport = await createPortableRecipeExport();
    const firstArchive = await readFile(firstExport.archivePath);
    const entries: string[] = [];
    await listTar({
      file: firstExport.archivePath,
      gzip: true,
      onReadEntry(entry) {
        entries.push(entry.path);
      },
    });
    const imageHash = checksum(
      await readFile(resolve(exportDataDirectory, 'uploads', firstImage.storageKey)),
    );
    expect(entries).toEqual([...entries].sort((left, right) => left.localeCompare(right)));
    expect(entries).toEqual(
      [
        `images/${imageHash}.webp`,
        'manifest.json',
        'recipes/00001.jsonld',
        'recipes/00002.jsonld',
      ].sort((left, right) => left.localeCompare(right)),
    );

    await rm(extractionDirectory, { recursive: true, force: true });
    await mkdir(extractionDirectory, { recursive: true });
    await extractTar({
      file: firstExport.archivePath,
      cwd: extractionDirectory,
      gzip: true,
      strict: true,
    });
    const manifest = JSON.parse(
      await readFile(resolve(extractionDirectory, 'manifest.json'), 'utf8'),
    );
    expect(manifest).toMatchObject({
      format: PORTABLE_RECIPE_EXPORT_FORMAT,
      version: 1,
      recipeCount: 2,
      imageCount: 1,
    });
    expect(manifest.files).toHaveLength(3);
    for (const file of manifest.files) {
      const bytes = await readFile(resolve(extractionDirectory, file.path));
      expect(bytes.byteLength).toBe(file.bytes);
      expect(checksum(bytes)).toBe(file.sha256);
    }
    const firstDocument = JSON.parse(
      await readFile(resolve(extractionDirectory, manifest.recipes[0].document), 'utf8'),
    );
    expect(firstDocument).toMatchObject({ '@context': 'https://schema.org', '@type': 'Recipe' });
    expect(firstDocument.image[0]).toMatchObject({
      '@type': 'ImageObject',
      contentUrl: `../${manifest.recipes[0].images[0]}`,
    });
    const readableExport = [
      JSON.stringify(manifest),
      ...(await Promise.all(
        manifest.recipes.map((recipe: { document: string }) =>
          readFile(resolve(extractionDirectory, recipe.document), 'utf8'),
        ),
      )),
    ].join('\n');
    expect(readableExport).not.toContain('Maya');
    expect(readableExport).not.toContain('Private Sunday suppers');
    expect(readableExport).not.toContain('Private household note');
    expect(readableExport).not.toContain(firstImage.storageKey);
    await firstExport.cleanup();

    const secondExport = await createPortableRecipeExport();
    await expect(readFile(secondExport.archivePath)).resolves.toEqual(firstArchive);
    await secondExport.cleanup();
  }, 15_000);

  it('rejects oversized or symbolic-link media instead of following it into the archive', async () => {
    const profile = setupProfile();
    const recipe = createExportRecipe(profile.id, 'Safety soup');
    const image = await createRecipeImage(
      recipe.id,
      profile.id,
      await recipePhoto(),
      'Safety soup',
    );
    const imagePath = resolve(exportDataDirectory, 'uploads', image.storageKey);

    await writeFile(
      imagePath,
      Buffer.concat([Buffer.from('RIFF0000WEBP'), Buffer.alloc(10 * 1024 * 1024)]),
    );
    await expect(createPortableRecipeExport()).rejects.toThrow('10 MB safety limit');

    await unlink(imagePath);
    const outsideImage = resolve(exportDataDirectory, 'outside.webp');
    await writeFile(outsideImage, Buffer.from('RIFF0000WEBP'));
    await symlink(outsideImage, imagePath, 'file');
    await expect(createPortableRecipeExport()).rejects.toThrow('could not be created safely');
  });
});
