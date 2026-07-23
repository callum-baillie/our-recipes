import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { eq } from 'drizzle-orm';

vi.mock('server-only', () => ({}));

import {
  ensureDatabase,
  getDatabase,
  getSqliteDatabase,
  resetDatabaseForTests,
} from '@/lib/db/client';
import {
  pantryProducts,
  profiles,
  recipeIngredientGroups,
  recipeIngredientProductMappings,
  recipeIngredients,
  recipeInstructionSections,
  recipeSteps,
  recipes,
} from '@/lib/db/schema';
import {
  appendConfirmedRecipeConsumption,
  appendManualProductNutritionRecord,
  calculateRecipeNutrition,
  captureRecipeIngredientMappings,
  getRecipeNutritionPresentation,
  getRecipeCalculationHistory,
  listProductNutritionRecordHistory,
  listRecipeNutritionPresentations,
  recalculateRecipeNutritionAfterRecipeEdit,
  restoreRecipeIngredientMappings,
  summarizeRecipeCalculation,
} from '@/lib/services/nutrition-recipe-calculation-service';
import { listNutritionIntakeRevisions } from '@/lib/services/nutrition-intake-service';
import {
  getRecipe,
  recipePayloadFromDetail,
  restoreRecipeRevisionWithIntegrations,
  updateRecipeNutritionEstimateWithIntegrations,
  updateRecipeStatusWithIntegrations,
  updateRecipeTagsWithIntegrations,
  updateRecipeWithIntegrations,
} from '@/lib/services/recipe-service';
import { createNutritionIdentity } from './nutrition-household-fixture';

describe('recipe Nutrition production service', () => {
  const actorId = '11111111-1111-4111-8111-111111111111';
  const productId = '22222222-2222-4222-8222-222222222222';
  const recipeId = '33333333-3333-4333-8333-333333333333';
  const groupId = '44444444-4444-4444-8444-444444444444';
  const ingredientId = '55555555-5555-4555-8555-555555555555';
  const missingIngredientId = '66666666-6666-4666-8666-666666666666';

  beforeEach(() => {
    vi.stubEnv('DATABASE_URL', ':memory:');
    vi.stubEnv('DATA_DIR', './.test-data/nutrition-recipe-service');
    resetDatabaseForTests();
    ensureDatabase();
    const database = getDatabase();
    const now = new Date('2026-07-19T00:00:00Z');
    database
      .insert(profiles)
      .values({
        id: actorId,
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
        normalizedName: 'lentils',
        displayName: 'Lentils',
        defaultInventoryUnit: 'g',
        createdByProfileId: actorId,
        updatedByProfileId: actorId,
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
        createdByProfileId: actorId,
        lastEditedByProfileId: actorId,
        currentRevision: 1,
        createdAt: now,
        updatedAt: now,
      })
      .run();
    database
      .insert(recipeIngredientGroups)
      .values({
        id: groupId,
        recipeId,
        position: 0,
        name: '',
      })
      .run();
    database
      .insert(recipeIngredients)
      .values([
        {
          id: ingredientId,
          recipeId,
          groupId,
          position: 0,
          quantity: 200,
          unit: 'g',
          item: 'lentils',
          note: '',
        },
        {
          id: missingIngredientId,
          recipeId,
          groupId,
          position: 1,
          quantity: 1,
          unit: 'splash',
          item: 'stock',
          note: '',
        },
      ])
      .run();
    database
      .insert(recipeIngredientProductMappings)
      .values({
        recipeIngredientId: ingredientId,
        productId,
        matchType: 'manual',
        compatibleVariant: false,
        isOptional: false,
        mappedByProfileId: actorId,
        createdAt: now,
        updatedAt: now,
      })
      .run();
  });

  afterEach(() => {
    resetDatabaseForTests();
    vi.unstubAllEnvs();
  });

  it('persists deterministic calculation history and immutable confirmed snapshots', () => {
    const firstRecord = appendManualProductNutritionRecord(productId, {
      basisType: 'per_100g',
      basisAmount: 100,
      basisUnit: 'g',
      confidence: 0.9,
      completeness: 0.8,
      values: [
        { nutrientCode: 'protein', amount: 25 },
        { nutrientCode: 'carbohydrate', amount: 60 },
        { nutrientCode: 'total_fat', amount: 2 },
      ],
    });
    const first = calculateRecipeNutrition(recipeId, {});
    expect(first.servingCount).toBe(4);
    expect(first.values.find((value) => value.nutrientCode === 'protein')?.amount).toBe(50);
    expect(first.values.find((value) => value.nutrientCode === 'energy_kcal')?.amount).toBe(716);
    expect(
      first.contributions.find((item) => item.recipeIngredientId === missingIngredientId),
    ).toMatchObject({
      completeness: 0,
      missingReason: 'Ingredient is not mapped to a Pantry product.',
    });
    expect(calculateRecipeNutrition(recipeId, {}).id).toBe(first.id);

    const identity = createNutritionIdentity('correct horse battery staple', {
      displayName: 'Private Avery',
    });
    const intake = appendConfirmedRecipeConsumption(identity.profile.id, identity.principal.id, {
      recipeCalculationId: first.id,
      servingCount: 1,
      occurredAt: '2026-07-19T18:00:00-07:00',
      mealSlot: 'dinner',
    });
    expect(intake.values.find((value) => value.nutrientCode === 'protein')?.amount).toBe(12.5);
    expect(intake.provenance).toMatchObject({
      calculationVersionId: 'bord_recipe_calculator_v2',
      estimated: true,
    });

    appendManualProductNutritionRecord(productId, {
      basisType: 'per_100g',
      basisAmount: 100,
      basisUnit: 'g',
      confidence: 1,
      completeness: 0.9,
      supersedesRecordId: firstRecord.id,
      values: [
        { nutrientCode: 'energy_kcal', amount: 300 },
        { nutrientCode: 'protein', amount: 30 },
        { nutrientCode: 'carbohydrate', amount: 55 },
        { nutrientCode: 'total_fat', amount: 3 },
      ],
    });
    const second = calculateRecipeNutrition(recipeId, {});
    expect(second.id).not.toBe(first.id);
    expect(second.revision).toBe(first.revision + 1);
    expect(getRecipeCalculationHistory(recipeId)).toHaveLength(2);
    expect(listProductNutritionRecordHistory(productId)).toHaveLength(2);
    expect(
      listNutritionIntakeRevisions(identity.profile.id, identity.principal.id)[0]!.values.find(
        (value) => value.nutrientCode === 'protein',
      )?.amount,
    ).toBe(12.5);
  });

  it('restores exact ingredient mappings after ID churn and recalculates a new recipe revision', () => {
    appendManualProductNutritionRecord(productId, {
      basisType: 'per_100g',
      basisAmount: 100,
      basisUnit: 'g',
      confidence: 0.9,
      completeness: 0.8,
      values: [{ nutrientCode: 'protein', amount: 25 }],
    });
    const first = calculateRecipeNutrition(recipeId, {});
    const snapshot = captureRecipeIngredientMappings(recipeId);
    expect(snapshot).toHaveLength(1);

    const database = getDatabase();
    database
      .delete(recipeIngredientGroups)
      .where(eq(recipeIngredientGroups.recipeId, recipeId))
      .run();
    database
      .update(recipes)
      .set({ currentRevision: 2, servings: '8', updatedAt: new Date('2026-07-20T00:00:00Z') })
      .where(eq(recipes.id, recipeId))
      .run();
    const nextGroupId = '77777777-7777-4777-8777-777777777777';
    const nextIngredientId = '88888888-8888-4888-8888-888888888888';
    database
      .insert(recipeIngredientGroups)
      .values({ id: nextGroupId, recipeId, position: 0, name: '' })
      .run();
    database
      .insert(recipeIngredients)
      .values({
        id: nextIngredientId,
        recipeId,
        groupId: nextGroupId,
        position: 0,
        quantity: 400,
        unit: 'g',
        item: 'lentils',
        note: '',
      })
      .run();

    expect(restoreRecipeIngredientMappings(recipeId, snapshot)).toEqual({
      restored: 1,
      missing: 0,
    });
    const result = recalculateRecipeNutritionAfterRecipeEdit(recipeId);
    expect(result).toMatchObject({ status: 'updated', recipeRevision: 2 });
    const presentation = getRecipeNutritionPresentation(recipeId);
    expect(presentation.status).toBe('current');
    expect(presentation.values.find((value) => value.nutrientCode === 'protein')?.perServing).toBe(
      12.5,
    );
    expect(getRecipeCalculationHistory(recipeId)).toHaveLength(2);
    expect(getRecipeCalculationHistory(recipeId)[1]?.id).toBe(first.id);
  });

  it('preserves mappings and refreshes normalized Nutrition through the shared recipe command', () => {
    appendManualProductNutritionRecord(productId, {
      basisType: 'per_100g',
      basisAmount: 100,
      basisUnit: 'g',
      confidence: 1,
      completeness: 1,
      values: [{ nutrientCode: 'protein', amount: 25 }],
    });
    calculateRecipeNutrition(recipeId, {});
    const recipe = getRecipe(recipeId);
    expect(recipe).not.toBeNull();

    const result = updateRecipeWithIntegrations(
      recipeId,
      {
        ...recipePayloadFromDetail(recipe!),
        title: 'Updated lentil soup',
        servings: '8',
        instructionSections: [{ title: '', steps: ['Simmer until tender.'] }],
      },
      actorId,
      1,
    );

    expect(result.recipe).toMatchObject({
      title: 'Updated lentil soup',
      servings: '8',
      currentRevision: 2,
    });
    expect(result.nutritionMappingRestore).toEqual({
      restored: 1,
      missing: 0,
      status: 'available',
    });
    expect(result.nutritionRecalculation).toMatchObject({
      status: 'updated',
      recipeRevision: 2,
    });
    expect(captureRecipeIngredientMappings(recipeId)).toMatchObject([
      { productId, mappedByProfileId: actorId },
    ]);
    expect(getRecipeNutritionPresentation(recipeId)).toMatchObject({
      status: 'current',
      recipeRevision: 2,
    });
  });

  it('keeps mappings and visible recalculation results through tag, lifecycle, restore, and estimate paths', () => {
    const sectionId = '99999999-9999-4999-8999-999999999991';
    getDatabase()
      .insert(recipeInstructionSections)
      .values({ id: sectionId, recipeId, position: 0, title: '' })
      .run();
    getDatabase()
      .insert(recipeSteps)
      .values({
        id: '99999999-9999-4999-8999-999999999992',
        recipeId,
        sectionId,
        position: 0,
        body: 'Simmer until tender.',
      })
      .run();
    appendManualProductNutritionRecord(productId, {
      basisType: 'per_100g',
      basisAmount: 100,
      basisUnit: 'g',
      confidence: 1,
      completeness: 1,
      values: [{ nutrientCode: 'protein', amount: 25 }],
    });
    calculateRecipeNutrition(recipeId, {});
    const results = [
      updateRecipeTagsWithIntegrations(recipeId, ['weeknight'], actorId, 1),
      updateRecipeStatusWithIntegrations(recipeId, 'archived', actorId, 2),
      restoreRecipeRevisionWithIntegrations(recipeId, 2, actorId, 3),
      updateRecipeNutritionEstimateWithIntegrations(
        recipeId,
        {
          servings: '4',
          nutritionCalories: 100,
          nutritionProteinGrams: 10,
          nutritionCarbohydrateGrams: 12,
          nutritionFatGrams: 2,
          nutritionSaturatedFatGrams: 1,
          nutritionFiberGrams: 4,
          nutritionSugarGrams: 1,
          nutritionSodiumMilligrams: 50,
          confidence: 0.5,
          warnings: ['Unverified estimate.'],
        },
        actorId,
        4,
      ),
    ];

    expect(
      results.map((result) => ({
        mapping: result.nutritionMappingRestore,
        nutrition: result.nutritionRecalculation.status,
      })),
    ).toEqual(
      Array.from({ length: 4 }, () => ({
        mapping: { restored: 1, missing: 0, status: 'available' },
        nutrition: 'updated',
      })),
    );
    expect(captureRecipeIngredientMappings(recipeId)).toMatchObject([{ productId }]);
    expect(getRecipeNutritionPresentation(recipeId)).toMatchObject({
      status: 'current',
      recipeRevision: 5,
    });
  });

  it('batches current, stale, and unavailable card presentations in one query', () => {
    appendManualProductNutritionRecord(productId, {
      basisType: 'per_100g',
      basisAmount: 100,
      basisUnit: 'g',
      confidence: 1,
      completeness: 1,
      values: [
        { nutrientCode: 'protein', amount: 25 },
        { nutrientCode: 'carbohydrate', amount: 60 },
        { nutrientCode: 'total_fat', amount: 2 },
      ],
    });
    calculateRecipeNutrition(recipeId, {});
    getDatabase().update(recipes).set({ currentRevision: 2 }).where(eq(recipes.id, recipeId)).run();
    const now = new Date('2026-07-19T00:00:00Z');
    const bulkIds = Array.from(
      { length: 100 },
      (_, index) => `aaaaaaaa-aaaa-4aaa-8aaa-${String(index).padStart(12, '0')}`,
    );
    getDatabase().transaction((transaction) => {
      for (const id of bulkIds) {
        transaction
          .insert(recipes)
          .values({
            id,
            title: `Bulk recipe ${id.slice(-4)}`,
            summary: '',
            status: 'active',
            servings: '4',
            prepMinutes: 0,
            cookMinutes: 0,
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
            createdByProfileId: actorId,
            lastEditedByProfileId: actorId,
            currentRevision: 1,
            createdAt: now,
            updatedAt: now,
          })
          .run();
      }
    });
    const prepare = vi.spyOn(getSqliteDatabase(), 'prepare');
    const result = listRecipeNutritionPresentations([recipeId, ...bulkIds]);
    expect(prepare).toHaveBeenCalledTimes(1);
    expect(result[recipeId]).toMatchObject({ status: 'stale', recipeRevision: 1 });
    expect(result[bulkIds[0]!]).toMatchObject({ status: 'unavailable', values: [] });
    expect(Object.keys(result)).toHaveLength(101);
  });

  it('applies server-resolved preparation evidence and supports immutable weighed portions', () => {
    appendManualProductNutritionRecord(productId, {
      basisType: 'per_100g',
      basisAmount: 100,
      basisUnit: 'g',
      confidence: 1,
      completeness: 1,
      values: [{ nutrientCode: 'protein', amount: 25 }],
    });
    const baseline = calculateRecipeNutrition(recipeId, { finalWeightGrams: 800 });
    expect(baseline.values.find((value) => value.nutrientCode === 'protein')?.amount).toBe(50);
    expect(
      summarizeRecipeCalculation(baseline)?.values.find(
        (value) => value.nutrientCode === 'protein',
      ),
    ).toMatchObject({ perServing: 12.5, per100g: 6.25 });

    const concentrated = calculateRecipeNutrition(recipeId, { finalWeightGrams: 400 });
    expect(concentrated.values.find((value) => value.nutrientCode === 'protein')).toMatchObject({
      amount: 50,
      confidence: 1,
    });
    expect(
      summarizeRecipeCalculation(concentrated)?.values.find(
        (value) => value.nutrientCode === 'protein',
      )?.per100g,
    ).toBe(12.5);

    const adjusted = calculateRecipeNutrition(recipeId, {
      finalWeightGrams: 800,
      excludedIngredientIds: [missingIngredientId],
      preparationFactors: [
        {
          recipeIngredientId: ingredientId,
          ediblePortion: 0.8,
          drainedYield: 0.5,
          evidenceNote: 'Weighed edible and drained portions.',
        },
      ],
    });
    expect(adjusted.values.find((value) => value.nutrientCode === 'protein')).toMatchObject({
      amount: 20,
      confidence: 1,
    });
    expect(
      adjusted.contributions.find((item) => item.recipeIngredientId === ingredientId),
    ).toMatchObject({
      ediblePortion: 0.8,
      drainedYield: 0.5,
    });
    expect(
      adjusted.contributions.find((item) => item.recipeIngredientId === missingIngredientId),
    ).toMatchObject({ optionalIncluded: false });

    const substituteProductId = '99999999-9999-4999-8999-999999999999';
    getDatabase()
      .insert(pantryProducts)
      .values({
        id: substituteProductId,
        normalizedName: 'cooked-lentils',
        displayName: 'Cooked lentils',
        defaultInventoryUnit: 'g',
        createdByProfileId: actorId,
        updatedByProfileId: actorId,
        createdAt: new Date('2026-07-19T00:00:00Z'),
        updatedAt: new Date('2026-07-19T00:00:00Z'),
      })
      .run();
    appendManualProductNutritionRecord(substituteProductId, {
      basisType: 'per_100g',
      basisAmount: 100,
      basisUnit: 'g',
      confidence: 0.9,
      completeness: 1,
      notes: 'Direct cooked-food label record.',
      values: [{ nutrientCode: 'protein', amount: 10 }],
    });
    const substituted = calculateRecipeNutrition(recipeId, {
      finalWeightGrams: 400,
      substitutions: [{ recipeIngredientId: ingredientId, productId: substituteProductId }],
    });
    expect(substituted.values.find((value) => value.nutrientCode === 'protein')?.amount).toBe(20);

    const identity = createNutritionIdentity('weighed portion owner secret', {
      displayName: 'Weighed diner',
    });
    const intake = appendConfirmedRecipeConsumption(identity.profile.id, identity.principal.id, {
      recipeCalculationId: substituted.id,
      portionWeightGrams: 100,
      occurredAt: '2026-07-19T18:00:00-07:00',
      mealSlot: 'dinner',
    });
    expect(intake).toMatchObject({ portionWeightGrams: 100, servingCount: null });
    expect(intake.values.find((value) => value.nutrientCode === 'protein')?.amount).toBe(5);
    expect(intake.provenance).toMatchObject({ basisType: 'recipe_weight', basisAmount: 100 });
  });
});
