import Database from 'better-sqlite3';
import { readFileSync, readdirSync } from 'node:fs';
import { join } from 'node:path';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
vi.mock('server-only', () => ({}));
import { ensureDatabase, getDatabase, resetDatabaseForTests } from '@/lib/db/client';
import { pantryProducts, profiles, recipes } from '@/lib/db/schema';
import {
  NutritionFoundationConflictError,
  appendFoodNutritionRecord,
  appendRecipeNutritionCalculation,
  createNutritionDataSource,
  getFoodNutritionRecord,
  getLatestRecipeNutritionCalculation,
  listNutrientDefinitions,
  registerCalculationVersion,
  selectPreferredFoodNutritionRecord,
} from '@/lib/services/nutrition-foundation-service';

describe('nutrition foundation persistence', () => {
  const profileId = '22e9f62d-758a-4ea7-9f8c-fd57df98f0c8';
  const productId = 'f7097568-cd1d-496a-9631-8634031a2547';
  const recipeId = '6fd4d6c4-2760-4ec6-87cb-7dd954d88a36';
  beforeEach(() => {
    vi.stubEnv('DATABASE_URL', ':memory:');
    vi.stubEnv('DATA_DIR', './.test-data/nutrition-media');
    resetDatabaseForTests();
    ensureDatabase();
    const now = new Date('2026-07-19T00:00:00Z');
    const database = getDatabase();
    database
      .insert(profiles)
      .values({
        id: profileId,
        displayName: 'Avery',
        color: '#245b78',
        avatarUrl: null,
        units: 'metric',
        temperatureUnit: 'C',
        locale: 'en-US',
        timezone: 'America/Los_Angeles',
        archivedAt: null,
        createdAt: now,
        updatedAt: now,
      })
      .run();
    database
      .insert(pantryProducts)
      .values({
        id: productId,
        normalizedName: 'red lentils',
        displayName: 'Red lentils',
        defaultInventoryUnit: 'g',
        createdByProfileId: profileId,
        updatedByProfileId: profileId,
        createdAt: now,
        updatedAt: now,
      })
      .run();
    database
      .insert(recipes)
      .values({
        id: recipeId,
        title: 'Lentil soup',
        summary: '',
        status: 'active',
        servings: '4',
        prepMinutes: 10,
        cookMinutes: 30,
        restMinutes: 0,
        difficulty: '',
        cuisine: '',
        category: '',
        tips: '',
        sharedNotes: '',
        sourceName: null,
        sourceUrl: null,
        originalAuthor: null,
        cookingMethod: '',
        createdByProfileId: profileId,
        lastEditedByProfileId: profileId,
        currentRevision: 2,
        createdAt: now,
        updatedAt: now,
      })
      .run();
  });
  afterEach(() => {
    resetDatabaseForTests();
    vi.unstubAllEnvs();
  });
  const source = (name: string, priority: number) =>
    createNutritionDataSource({
      sourceType: 'manual',
      name,
      version: '1',
      citation: `${name} entry`,
      priority,
    });
  const food = (sourceId: string, protein: number, supersedesRecordId: string | null = null) =>
    appendFoodNutritionRecord({
      productId,
      sourceId,
      basisType: 'per_100g',
      basisAmount: 100,
      basisUnit: 'g',
      confidence: 0.9,
      completeness: 0.8,
      supersedesRecordId,
      recordedByProfileId: profileId,
      values: [
        { nutrientCode: 'protein', amount: protein },
        { nutrientCode: 'energy_kcal', amount: 350 },
      ],
    });

  it('migrates the canonical catalog', () => {
    expect(listNutrientDefinitions()).toHaveLength(46);
    expect(listNutrientDefinitions().find((item) => item.code === 'vitamin_d')).toMatchObject({
      canonicalUnit: 'mcg',
      category: 'vitamin',
    });
  });

  it('appends immutable product revisions and selects by explicit source priority', () => {
    const household = source('Household label', 10);
    const verified = source('Verified provider', 50);
    const first = food(household.id, 24);
    const second = food(verified.id, 25, first.id);
    const third = food(household.id, 26, second.id);
    expect(third.revision).toBe(3);
    expect(getFoodNutritionRecord(first.id).values).toEqual(
      expect.arrayContaining([expect.objectContaining({ nutrientCode: 'protein', amount: 24 })]),
    );
    expect(selectPreferredFoodNutritionRecord(productId)).toMatchObject({
      id: second.id,
      source: { name: 'Verified provider' },
    });
    expect(() => food(household.id, 27, first.id)).toThrow(NutritionFoundationConflictError);
  });

  it('requires explicit serving conversion evidence and leaves absent nutrients missing', () => {
    const label = source('Package label', 10);
    expect(() =>
      appendFoodNutritionRecord({
        productId,
        sourceId: label.id,
        basisType: 'per_serving',
        basisAmount: 1,
        basisUnit: 'serving',
        servingWeightGrams: null,
        confidence: 0.8,
        completeness: 0.1,
        recordedByProfileId: profileId,
        values: [{ nutrientCode: 'protein', amount: 5 }],
      }),
    ).toThrow(/serving weight evidence/iu);
  });

  it('stores traceable immutable recipe calculation revisions', () => {
    const calcSource = createNutritionDataSource({
      sourceType: 'calculated',
      name: 'Deterministic calculator',
      provider: 'Our Recipes',
      version: '1',
      citation: 'Local ingredient aggregation',
      priority: 20,
    });
    const version = registerCalculationVersion({
      algorithm: 'ingredient-sum',
      version: '1',
      energyFactorsVersion: 'general-4-4-9-7-v1',
      retentionFactorsVersion: 'none',
      implementationDigest: 'test-v1',
    });
    const first = appendRecipeNutritionCalculation({
      recipeId,
      recipeRevision: 2,
      calculationVersionId: version.id,
      sourceId: calcSource.id,
      sourceDigest: 'input-a',
      servingCount: 4,
      confidence: 0.7,
      completeness: 0.5,
      calculatedByProfileId: profileId,
      contributions: [
        {
          recipeIngredientId: null,
          productNutritionRecordId: null,
          amountMultiplier: 1,
          confidence: 0,
          completeness: 0,
          missingReason: 'Ingredient is not mapped.',
        },
      ],
      values: [{ nutrientCode: 'energy_kcal', amount: 800, confidence: 0.7, completeness: 0.5 }],
    });
    const second = appendRecipeNutritionCalculation({
      recipeId,
      recipeRevision: 2,
      calculationVersionId: version.id,
      sourceId: calcSource.id,
      sourceDigest: 'input-b',
      servingCount: 4,
      finalWeightGrams: 950,
      confidence: 0.8,
      completeness: 0.75,
      supersedesCalculationId: first.id,
      calculatedByProfileId: profileId,
      values: [{ nutrientCode: 'energy_kcal', amount: 820, confidence: 0.8, completeness: 0.75 }],
    });
    expect(getLatestRecipeNutritionCalculation(recipeId)).toMatchObject({
      id: second.id,
      revision: 2,
      sourceDigest: 'input-b',
    });
    expect(first.values[0]?.amount).toBe(800);
    expect(first.contributions[0]?.missingReason).toMatch(/not mapped/iu);
  });

  it('snapshots legacy fields when migration 0016 is applied before Pantry 0017', () => {
    const sqlite = new Database(':memory:');
    sqlite.pragma('foreign_keys = ON');
    const files = readdirSync(join(process.cwd(), 'drizzle'))
      .filter((file) => /^\d{4}_.+\.sql$/u.test(file))
      .sort();
    const execute = (file: string) =>
      readFileSync(join(process.cwd(), 'drizzle', file), 'utf8')
        .split('--> statement-breakpoint')
        .forEach((statement) => {
          if (statement.trim()) sqlite.exec(statement);
        });
    files.filter((file) => file < '0016_').forEach(execute);
    sqlite
      .prepare(
        "INSERT INTO profiles (id,display_name,color,avatar_url,units,temperature_unit,locale,timezone,created_at,updated_at) VALUES (?,'Legacy','#245b78',NULL,'metric','C','en-US','UTC',1,1)",
      )
      .run(profileId);
    sqlite
      .prepare(
        "INSERT INTO recipes (id,title,summary,servings,prep_minutes,cook_minutes,source_name,source_url,created_by_profile_id,last_edited_by_profile_id,current_revision,created_at,updated_at,nutrition_calories,nutrition_protein_grams,nutrition_sodium_milligrams) VALUES (?,'Legacy soup','','4',5,20,NULL,NULL,?,?,3,1,1,640,32,900)",
      )
      .run(recipeId, profileId, profileId);
    execute('0016_nutrition_foundation.sql');
    execute('0017_pantry_integrity.sql');
    expect(
      sqlite
        .prepare(
          'SELECT source_id,recipe_revision,completeness FROM recipe_nutrition_calculations WHERE recipe_id=?',
        )
        .get(recipeId),
    ).toEqual({ source_id: 'legacy_recipe_fields', recipe_revision: 3, completeness: 0.375 });
    expect(
      sqlite
        .prepare(
          'SELECT nutrient_code,amount FROM recipe_nutrient_values WHERE calculation_id=? ORDER BY nutrient_code',
        )
        .all(`legacy:${recipeId}:3`),
    ).toEqual([
      { nutrient_code: 'energy_kcal', amount: 640 },
      { nutrient_code: 'protein', amount: 32 },
      { nutrient_code: 'sodium', amount: 900 },
    ]);
    sqlite.close();
  });
});
