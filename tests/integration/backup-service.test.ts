import { randomUUID } from 'node:crypto';
import { user, profileAuthLinks, kitchenResourceClaims } from '@/lib/db/schema';
import {
  executeKitchenCommand,
  readKitchenInventory,
  manageKitchenPhase,
} from '@/lib/services/kitchen-inventory-service';
import { startCookSession } from '@/lib/services/cooking-service';
import { readCookingSessionRecipe } from '@/lib/services/cooking-session-recipe-service';
import type { RequestPrincipal } from '@/lib/services/auth-service';
import { existsSync, mkdirSync, rmSync, statSync } from 'node:fs';
import { spawnSync } from 'node:child_process';
import { readFile, writeFile } from 'node:fs/promises';
import { resolve } from 'node:path';
import sharp from 'sharp';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

import {
  createBackup,
  getBackupStorageStatus,
  listBackups,
  previewBackup,
  restoreBackup,
} from '@/lib/services/backup-service';
import { resetDatabaseForTests, getDatabase } from '@/lib/db/client';
import { completeSetup, getHouseholdState } from '@/lib/services/household-service';
import { createRecipe, getRecipe } from '@/lib/services/recipe-service';
import { createRecipeImage } from '@/lib/services/recipe-image-service';
import { BACKUP_RESTORE_MARKER } from '@/lib/domain/backup-recovery';
import { GET as health } from '@/app/api/v1/health/route';

const backupDataDirectory = resolve(process.cwd(), '.test-data/backup-recovery');
const dedicatedBackupDirectory = resolve(process.cwd(), '.test-data/backup-destination');

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
    rmSync(dedicatedBackupDirectory, { recursive: true, force: true });
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

    const accountId = randomUUID(),
      now = new Date();
    getDatabase()
      .insert(user)
      .values({
        id: accountId,
        name: 'Maya',
        email: `${accountId}@example.test`,
        role: 'admin',
        createdAt: now,
        updatedAt: now,
      })
      .run();
    getDatabase()
      .insert(profileAuthLinks)
      .values({ profileId: profile.id, userId: accountId, createdAt: now, updatedAt: now })
      .run();
    const principal: RequestPrincipal = {
      kind: 'session',
      userId: accountId,
      linkedProfileId: profile.id,
      profileId: profile.id,
      role: 'admin',
      accountRole: 'admin',
      activeProfileRole: 'admin',
      sessionId: 'backup-fixture',
      apiKeyId: null,
    };
    const inventoryCommand = {
      kind: 'add',
      operationId: randomUUID(),
      expectedRevision: 0,
      count: 2,
      item: {
        typeKey: 'pressure-air-multicooker',
        name: 'Backup cooker',
        measurements: [{ value: 6, unit: 'us-qt', basis: 'nominal-volume' }],
      },
    };
    const inventory = executeKitchenCommand(principal, inventoryCommand).kitchen;
    const cookingSession = startCookSession(recipe.id, profile.id, 4, null, accountId);
    manageKitchenPhase(principal, {
      operation: 'start',
      episodeId: cookingSession.id,
      phaseId: 'soup',
      plan: {
        expectedRevision: inventory.revision,
        episodeId: cookingSession.id,
        episodeContextRevision: 0,
        phases: [
          {
            id: 'soup',
            recipeId: recipe.id,
            recipeRevision: recipe.currentRevision,
            cookSessionId: cookingSession.id,
            cookSessionRevision: 1,
            stepRefs: [recipe.instructionSections[0]!.steps[0]!.id],
            capability: 'pressure-cook',
            durationMinutes: 25,
          },
        ],
      },
    });

    const backup = await createBackup();
    expect(backup.manifest.files.map((file) => file.path)).toContain('database.sqlite');
    expect(backup.manifest.files.map((file) => file.path)).toContain(`uploads/${image.storageKey}`);
    expect(existsSync(resolve(backupDataDirectory, 'backups', `${backup.id}.tar.gz`))).toBe(true);
    await expect(previewBackup(backup.id)).resolves.toMatchObject({ id: backup.id });

    executeKitchenCommand(principal, {
      ...inventoryCommand,
      operationId: randomUUID(),
      expectedRevision: inventory.revision,
      count: 1,
    });
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

    const dataInode = statSync(backupDataDirectory).ino;
    const restored = await restoreBackup(backup.id);
    expect(statSync(backupDataDirectory).ino).toBe(dataInode);
    expect(restored.safetyBackup.manifest.reason).toBe('pre-restore');
    expect(getRecipe(recipe.id)?.images).toHaveLength(1);
    expect(readKitchenInventory(principal).items.map((item) => item.id)).toEqual(
      inventory.items.map((item) => item.id),
    );
    expect(readCookingSessionRecipe(principal, cookingSession.id).effectiveRecipe?.title).toBe(
      'Backup tomato soup',
    );
    expect(getDatabase().select().from(kitchenResourceClaims).all()).toHaveLength(1);
    expect(executeKitchenCommand(principal, inventoryCommand).replayed).toBe(true);
    expect(readKitchenInventory(principal).items).toHaveLength(2);
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

  it('keeps dedicated backup storage outside a restored data-root swap', async () => {
    vi.stubEnv('BACKUP_DIR', './.test-data/backup-destination');
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
    const backup = await createBackup();

    expect(getBackupStorageStatus()).toMatchObject({
      directory: dedicatedBackupDirectory,
      location: 'dedicated',
      intervalHours: 24,
      retentionDays: 30,
    });
    expect(existsSync(resolve(dedicatedBackupDirectory, `${backup.id}.tar.gz`))).toBe(true);
    expect(existsSync(resolve(backupDataDirectory, 'backups'))).toBe(false);

    createRecipe(
      {
        title: 'Removed by dedicated restore',
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

    const restored = await restoreBackup(backup.id);
    expect(restored.safetyBackup.manifest.reason).toBe('pre-restore');
    expect((await listBackups()).length).toBeGreaterThanOrEqual(2);
    expect(existsSync(resolve(dedicatedBackupDirectory, `${backup.id}.tar.gz`))).toBe(true);
    expect(existsSync(resolve(backupDataDirectory, 'backups'))).toBe(false);
  }, 20_000);

  it('refuses a competing restore while the first validated operation is running', async () => {
    completeSetup({
      householdName: 'Restore lock fixture',
      appName: 'Bord',
      profile: {
        displayName: 'Maya',
        color: '#637A45',
        avatarUrl: '',
        units: 'metric',
        temperatureUnit: 'C',
        locale: 'en-US',
        timezone: 'UTC',
      },
    });
    const backup = await createBackup();
    const first = restoreBackup(backup.id);
    await expect(restoreBackup(backup.id)).rejects.toThrow('already running');
    await expect(first).resolves.toHaveProperty('safetyBackup');
    await expect(restoreBackup(backup.id)).resolves.toHaveProperty('safetyBackup');
  }, 20_000);

  it('blocks database use and health after an interrupted restore instead of creating an empty database', async () => {
    completeSetup({
      householdName: 'Interrupted restore fixture',
      appName: 'Interrupted restore fixture',
      profile: {
        displayName: 'Maya',
        color: '#637A45',
        avatarUrl: '',
        units: 'metric',
        temperatureUnit: 'C',
        locale: 'en-US',
        timezone: 'UTC',
      },
    });
    const marker = resolve(backupDataDirectory, BACKUP_RESTORE_MARKER);
    await writeFile(marker, JSON.stringify({ previous: '.restore-previous-fixture' }));
    resetDatabaseForTests();
    expect(() => getHouseholdState()).toThrow('recovery is incomplete');
    const response = health();
    expect(response.status).toBe(503);
    expect(await response.json()).toMatchObject({
      status: 'recovery_required',
      migrationStatus: 'blocked',
    });
    const interruptedRoot = resolve(backupDataDirectory, 'interrupted-start');
    mkdirSync(interruptedRoot);
    await writeFile(resolve(interruptedRoot, BACKUP_RESTORE_MARKER), '{}');
    const startup = spawnSync(process.execPath, ['scripts/container-migrate.mjs'], {
      env: {
        ...process.env,
        DATA_DIR: interruptedRoot,
        DATABASE_URL: resolve(interruptedRoot, 'bord.db'),
        BACKUP_DIR: resolve(interruptedRoot, 'backups'),
      },
      encoding: 'utf8',
    });
    expect(startup.status).not.toBe(0);
    expect(startup.stderr).toContain('Backup recovery is incomplete');
    expect(existsSync(resolve(interruptedRoot, 'bord.db'))).toBe(false);
    rmSync(marker);
    expect(getHouseholdState().household?.kitchenName).toBe('Interrupted restore fixture');
  });
});
