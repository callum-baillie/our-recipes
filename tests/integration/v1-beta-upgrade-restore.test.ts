import Database from 'better-sqlite3';
import { drizzle } from 'drizzle-orm/better-sqlite3';
import { migrate } from 'drizzle-orm/better-sqlite3/migrator';
import { copyFileSync, mkdirSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { afterEach, describe, expect, it, vi } from 'vitest';

import { createBackup, restoreBackup } from '@/lib/services/backup-service';
import { ensureDatabase, getSqliteDatabase, resetDatabaseForTests } from '@/lib/db/client';

const root = resolve(process.cwd(), '.test-data/v1-beta-upgrade');
const databasePath = resolve(root, 'data/our-recipes.db');
const oldMigrations = resolve(root, 'beta-migrations');

function prepareLastBetaMigrations() {
  const source = resolve(process.cwd(), 'drizzle');
  const journal = JSON.parse(readFileSync(resolve(source, 'meta/_journal.json'), 'utf8')) as {
    entries: Array<{ idx: number; tag: string }>;
  };
  const entries = journal.entries.filter((entry) => entry.idx <= 35);
  mkdirSync(resolve(oldMigrations, 'meta'), { recursive: true });
  for (const entry of entries) {
    copyFileSync(resolve(source, `${entry.tag}.sql`), resolve(oldMigrations, `${entry.tag}.sql`));
  }
  writeFileSync(
    resolve(oldMigrations, 'meta/_journal.json'),
    JSON.stringify({ ...journal, entries }, null, 2),
  );
}

describe('v1 last-beta upgrade and restore', () => {
  afterEach(() => {
    resetDatabaseForTests();
    rmSync(root, { recursive: true, force: true });
    vi.unstubAllEnvs();
  });

  it('migrates representative beta household data and restores the upgraded v1 backup', async () => {
    prepareLastBetaMigrations();
    mkdirSync(resolve(root, 'data'), { recursive: true });
    const beta = new Database(databasePath);
    beta.pragma('foreign_keys = ON');
    migrate(drizzle(beta), { migrationsFolder: oldMigrations });
    const now = Date.now();
    const householdId = '10000000-0000-4000-8000-000000000001';
    const profileId = '10000000-0000-4000-8000-000000000002';
    const recipeId = '10000000-0000-4000-8000-000000000003';
    const groupId = '10000000-0000-4000-8000-000000000004';
    const ingredientId = '10000000-0000-4000-8000-000000000005';
    beta
      .prepare(
        'INSERT INTO households (id, name, app_name, brand_icon, created_at, updated_at) VALUES (?, ?, ?, ?, ?, ?)',
      )
      .run(householdId, 'Upgraded beta table', 'Our Recipes', 'chef-hat', now, now);
    beta
      .prepare(
        `INSERT INTO profiles
         (id, display_name, color, units, temperature_unit, locale, timezone, created_at, updated_at)
         VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)`,
      )
      .run(profileId, 'Maya', '#637A45', 'metric', 'C', 'en-US', 'America/Los_Angeles', now, now);
    beta
      .prepare(
        `INSERT INTO recipes
         (id, title, summary, status, servings, prep_minutes, cook_minutes, rest_minutes,
          difficulty, cuisine, category, tips, shared_notes, cooking_method,
          created_by_profile_id, last_edited_by_profile_id, current_revision, created_at, updated_at)
         VALUES (?, ?, '', 'active', '4 servings', 5, 20, 0, '', '', '', '', '', '', ?, ?, 1, ?, ?)`,
      )
      .run(recipeId, 'Beta lentil soup', profileId, profileId, now, now);
    beta
      .prepare(
        'INSERT INTO recipe_ingredient_groups (id, recipe_id, position, name) VALUES (?, ?, 0, ?)',
      )
      .run(groupId, recipeId, 'Soup');
    beta
      .prepare(
        `INSERT INTO recipe_ingredients
         (id, recipe_id, group_id, position, quantity, unit, item, note)
         VALUES (?, ?, ?, 0, 200, 'g', 'red lentils', '')`,
      )
      .run(ingredientId, recipeId, groupId);
    beta
      .prepare(
        `INSERT INTO meal_plan_entries
         (id, planned_for, meal, recipe_id, title, servings, note, status,
          created_by_profile_id, updated_by_profile_id, created_at, updated_at)
         VALUES (?, '2026-07-21', 'dinner', ?, '', 4, '', 'planned', ?, ?, ?, ?)`,
      )
      .run('10000000-0000-4000-8000-000000000006', recipeId, profileId, profileId, now, now);
    beta.close();

    vi.stubEnv('DATA_DIR', './.test-data/v1-beta-upgrade/data');
    vi.stubEnv('DATABASE_URL', './.test-data/v1-beta-upgrade/data/our-recipes.db');
    resetDatabaseForTests();
    ensureDatabase();
    const sqlite = getSqliteDatabase();
    expect(sqlite.pragma('integrity_check', { simple: true })).toBe('ok');
    expect(
      sqlite.prepare('SELECT kitchen_name, kitchen_icon FROM households LIMIT 1').get(),
    ).toEqual({ kitchen_name: 'Upgraded beta table', kitchen_icon: 'chef-hat' });
    const upgradedMeal = sqlite
      .prepare(
        'SELECT recipe_revision, recipe_title_snapshot, recipe_ingredients_snapshot FROM meal_plan_entries LIMIT 1',
      )
      .get() as {
      recipe_revision: number;
      recipe_title_snapshot: string;
      recipe_ingredients_snapshot: string;
    };
    expect(upgradedMeal).toMatchObject({
      recipe_revision: 1,
      recipe_title_snapshot: 'Beta lentil soup',
    });
    expect(JSON.parse(upgradedMeal.recipe_ingredients_snapshot)).toMatchObject({
      baseServings: '4 servings',
      ingredients: [{ ingredientId, item: 'red lentils', quantity: 200, unit: 'g' }],
    });

    const backup = await createBackup('manual');
    sqlite.prepare('DELETE FROM recipes WHERE id = ?').run(recipeId);
    expect(sqlite.prepare('SELECT COUNT(*) AS count FROM recipes').get()).toMatchObject({
      count: 0,
    });
    await restoreBackup(backup.id);
    expect(
      getSqliteDatabase().prepare('SELECT title FROM recipes WHERE id = ?').get(recipeId),
    ).toEqual({ title: 'Beta lentil soup' });
    expect(getSqliteDatabase().pragma('integrity_check', { simple: true })).toBe('ok');
  }, 30_000);
});
