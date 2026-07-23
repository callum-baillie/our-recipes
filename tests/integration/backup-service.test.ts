import { existsSync, rmSync } from 'node:fs';
import { readFile, writeFile } from 'node:fs/promises';
import { resolve } from 'node:path';
import sharp from 'sharp';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

import {
  createBackup,
  listBackups,
  previewBackup,
  restoreBackup,
} from '@/lib/services/backup-service';
import { resetDatabaseForTests } from '@/lib/db/client';
import { completeSetup, getHouseholdState } from '@/lib/services/household-service';
import { createRecipe, getRecipe } from '@/lib/services/recipe-service';
import { createRecipeImage } from '@/lib/services/recipe-image-service';

const backupDataDirectory = resolve(process.cwd(), '.test-data/backup-recovery');

describe('backup and recovery', () => {
  beforeEach(() => {
    vi.stubEnv('DATA_DIR', './.test-data/backup-recovery');
    vi.stubEnv('DATABASE_URL', './.test-data/backup-recovery/our-recipes.db');
    vi.stubEnv('BACKUP_RETENTION_DAYS', '30');
    vi.stubEnv('BACKUP_INTERVAL_HOURS', '24');
    resetDatabaseForTests();
  });

  afterEach(() => {
    resetDatabaseForTests();
    rmSync(backupDataDirectory, { recursive: true, force: true });
    vi.unstubAllEnvs();
  });

  it('round-trips a checksummed SQLite and local-image backup through an explicit restore', async () => {
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
    const recipe = createRecipe(
      {
        title: 'Backup tomato soup',
        summary: '',
        servings: '4 bowls',
        prepMinutes: 10,
        cookMinutes: 25,
        sourceName: '',
        sourceUrl: '',
        tags: ['weeknight'],
        ingredientGroups: [
          { name: '', ingredients: [{ quantity: 2, unit: 'tbsp', item: 'olive oil', note: '' }] },
        ],
        instructionSections: [{ title: '', steps: ['Simmer gently.'] }],
      },
      profile.id,
    );
    const sourceImage = await sharp({
      create: { width: 24, height: 16, channels: 3, background: '#9f482f' },
    })
      .png()
      .toBuffer();
    const image = await createRecipeImage(recipe.id, profile.id, sourceImage, 'Backup soup');

    const backup = await createBackup();
    expect(backup.manifest.files.map((file) => file.path)).toContain('database.sqlite');
    expect(backup.manifest.files.map((file) => file.path)).toContain(`uploads/${image.storageKey}`);
    expect(existsSync(resolve(backupDataDirectory, 'backups', `${backup.id}.tar.gz`))).toBe(true);
    await expect(previewBackup(backup.id)).resolves.toMatchObject({ id: backup.id });

    createRecipe(
      {
        title: 'Should disappear after restore',
        summary: '',
        servings: '1 serving',
        prepMinutes: 1,
        cookMinutes: 1,
        sourceName: '',
        sourceUrl: '',
        tags: [],
        ingredientGroups: [
          { name: '', ingredients: [{ quantity: 1, unit: '', item: 'bread', note: '' }] },
        ],
        instructionSections: [{ title: '', steps: ['Toast.'] }],
      },
      profile.id,
    );
    expect(getHouseholdState().profiles).toHaveLength(1);

    const restored = await restoreBackup(backup.id);
    expect(restored.safetyBackup.manifest.reason).toBe('pre-restore');
    expect(getRecipe(recipe.id)?.images).toHaveLength(1);
    expect(getHouseholdState().household?.kitchenName).toBe('Sunday suppers');
    expect((await listBackups()).length).toBeGreaterThanOrEqual(2);
    expect(existsSync(resolve(backupDataDirectory, 'uploads', image.storageKey))).toBe(true);
  }, 20_000);

  it('refuses a byte-tampered archive during preview validation', async () => {
    completeSetup({
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
    });
    const backup = await createBackup();
    const archivePath = resolve(backupDataDirectory, 'backups', `${backup.id}.tar.gz`);
    const archive = await readFile(archivePath);
    archive[archive.length - 1] = archive[archive.length - 1]! ^ 0xff;
    await writeFile(archivePath, archive);

    await expect(previewBackup(backup.id)).rejects.toThrow('backup could not be validated safely');
  });
});
