import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

import { getSqliteDatabase, resetDatabaseForTests } from '@/lib/db/client';
import { completeSetup } from '@/lib/services/household-service';
import { listRecipeLibrary } from '@/lib/services/recipe-service';

const RECIPE_COUNT = 10_000;
const MAX_QUERY_MS = 1_500;

describe('recipe library performance', () => {
  beforeEach(() => {
    vi.stubEnv('DATABASE_URL', ':memory:');
    vi.stubEnv('DATA_DIR', './.test-data/performance-media');
    resetDatabaseForTests();
  });

  afterEach(() => {
    resetDatabaseForTests();
    vi.unstubAllEnvs();
  });

  it('returns a paginated full-text search from a 10,000-recipe household within the local budget', () => {
    const profile = completeSetup({
      householdName: 'The Performance Table',
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
    const sqlite = getSqliteDatabase();
    const now = Date.now();
    const insertRecipe = sqlite.prepare(`
      INSERT INTO recipes (
        id, title, summary, status, servings, prep_minutes, cook_minutes,
        rest_minutes, difficulty, cuisine, category, tips, shared_notes,
        cooking_method, created_by_profile_id, last_edited_by_profile_id,
        current_revision, created_at, updated_at
      ) VALUES (?, ?, ?, 'active', '4 servings', 10, 20, 0, '', '', '', '', '', '', ?, ?, 1, ?, ?)
    `);
    const insertSearch = sqlite.prepare(`
      INSERT INTO recipe_search (recipe_id, title, summary, ingredients, tags)
      VALUES (?, ?, ?, ?, ?)
    `);

    sqlite.transaction(() => {
      for (let index = 0; index < RECIPE_COUNT; index += 1) {
        const id = `performance-recipe-${index}`;
        const title = `Weeknight benchmark recipe ${index}`;
        insertRecipe.run(
          id,
          title,
          'A repeatable full-library search fixture.',
          profile.id,
          profile.id,
          now,
          now,
        );
        insertSearch.run(
          id,
          title,
          'A repeatable full-library search fixture.',
          'tomatoes basil',
          'weeknight',
        );
      }
    })();

    const startedAt = performance.now();
    const result = listRecipeLibrary(
      { q: 'benchmark', status: 'active', sort: 'recently-updated', page: 1 },
      profile.id,
    );
    const elapsedMs = performance.now() - startedAt;

    expect(result.total).toBe(RECIPE_COUNT);
    expect(result.recipes).toHaveLength(24);
    expect(result.totalPages).toBe(Math.ceil(RECIPE_COUNT / 24));
    expect(elapsedMs).toBeLessThan(MAX_QUERY_MS);
  });
});
