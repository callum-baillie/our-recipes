import { existsSync, rmSync } from 'node:fs';
import { resolve } from 'node:path';

import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

vi.mock('server-only', () => ({}));

import { resetDatabaseForTests } from '@/lib/db/client';
import { getAppPreferences, updateAppPreferences } from '@/lib/services/app-preferences-service';
import { performFreshInstall } from '@/lib/services/fresh-install-service';
import { completeSetup, getHouseholdState } from '@/lib/services/household-service';

const dataDirectory = resolve(process.cwd(), '.test-data/app-preferences');
const databasePath = resolve(dataDirectory, 'settings.db');

function setupHousehold() {
  return completeSetup({
    householdName: 'Settings test kitchen',
    appName: 'Our Recipes',
    profile: {
      displayName: 'Maya',
      color: '#637A45',
      avatarUrl: '',
      units: 'metric',
      temperatureUnit: 'C',
      locale: 'en-US',
      timezone: 'America/Los_Angeles',
    },
  }).profiles[0]!;
}

describe('app preference persistence and fresh install', () => {
  beforeEach(() => {
    vi.stubEnv('DATA_DIR', dataDirectory);
    vi.stubEnv('DATABASE_URL', databasePath);
    resetDatabaseForTests();
    rmSync(dataDirectory, { recursive: true, force: true });
  });

  afterEach(() => {
    resetDatabaseForTests();
    rmSync(dataDirectory, { recursive: true, force: true });
    vi.unstubAllEnvs();
  });

  it('persists recipe, meal-plan, and pantry defaults for the household', () => {
    const profile = setupHousehold();
    expect(getAppPreferences().recipes.defaultServings).toBe(4);
    updateAppPreferences(
      { category: 'recipes', values: { defaultSort: 'alphabetical', defaultServings: 6 } },
      profile.id,
    );
    updateAppPreferences(
      {
        category: 'mealPlan',
        values: { weekStartsOn: 0, defaultDuration: 5, defaultMealTypes: ['dinner', 'snack'] },
      },
      profile.id,
    );
    updateAppPreferences(
      {
        category: 'pantry',
        values: { defaultView: 'low_stock', defaultSort: 'quantity', defaultGroup: 'category' },
      },
      profile.id,
    );
    expect(getAppPreferences()).toMatchObject({
      recipes: { defaultSort: 'alphabetical', defaultServings: 6 },
      mealPlan: { weekStartsOn: 0, defaultDuration: 5, defaultMealTypes: ['dinner', 'snack'] },
      pantry: { defaultView: 'low_stock', defaultSort: 'quantity', defaultGroup: 'category' },
    });
  });

  it('creates a safety backup and clears the active app database', async () => {
    setupHousehold();
    expect(existsSync(databasePath)).toBe(true);
    const result = await performFreshInstall();
    expect(result.safetyBackupId).toMatch(/^[0-9a-f-]{36}$/u);
    expect(existsSync(databasePath)).toBe(true);
    expect(getHouseholdState()).toEqual({ household: null, profiles: [] });
    expect(existsSync(resolve(dataDirectory, 'backups', `${result.safetyBackupId}.tar.gz`))).toBe(
      true,
    );
  });
});
