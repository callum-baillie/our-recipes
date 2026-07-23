import { beforeEach, describe, expect, it, vi } from 'vitest';

vi.mock('server-only', () => ({}));

import { eq } from 'drizzle-orm';

import { getDatabase, getSqliteDatabase, resetDatabaseForTests } from '@/lib/db/client';
import { mealPlanEntries, nutritionMealAllocationVersions, recipes } from '@/lib/db/schema';
import { completeSetup } from '@/lib/services/household-service';
import {
  appendRecipeNutritionCalculation,
  createNutritionDataSource,
  registerCalculationVersion,
} from '@/lib/services/nutrition-foundation-service';
import {
  NutritionIntakeConflictError,
  appendNutritionIntakeRevision,
  appendNutritionMealAllocationVersion,
} from '@/lib/services/nutrition-intake-service';
import { getNutritionMealProjection } from '@/lib/services/nutrition-meal-planning-service';
import { createNutritionIdentity, createNutritionPrincipal } from './nutrition-household-fixture';

describe('private planned nutrition projection', () => {
  let mealPlanEntryId: string;
  let recipeId: string;
  let ownerProfileId: string;
  let ownerPrincipalId: string;
  let otherProfileId: string;
  let otherPrincipalId: string;
  let sourceId: string;

  beforeEach(() => {
    vi.stubEnv('DATABASE_URL', ':memory:');
    vi.stubEnv('DATA_DIR', './.test-data/nutrition-meal-planning');
    resetDatabaseForTests();
    const householdProfileId = completeSetup({
      householdName: 'Projection household',
      appName: 'Our Recipes',
      profile: {
        displayName: 'Household cook',
        color: '#245b78',
        avatarUrl: '',
        units: 'metric',
        temperatureUnit: 'C',
        locale: 'en-US',
        timezone: 'America/Los_Angeles',
      },
    }).profiles[0]!.id;
    const owner = createNutritionIdentity('projection owner secret', {
      displayName: 'Private owner',
      linkedHouseholdProfileId: householdProfileId,
      dailyResetTimezone: 'America/Los_Angeles',
    });
    const other = createNutritionIdentity('projection other secret', {
      displayName: 'Hidden other person',
      linkedHouseholdProfileId: householdProfileId,
      dailyResetTimezone: 'America/Los_Angeles',
    });
    ownerProfileId = owner.profile.id;
    ownerPrincipalId = owner.principal.id;
    otherProfileId = other.profile.id;
    otherPrincipalId = other.principal.id;

    recipeId = crypto.randomUUID();
    mealPlanEntryId = crypto.randomUUID();
    const now = new Date('2026-07-19T18:00:00Z');
    getDatabase()
      .insert(recipes)
      .values({
        id: recipeId,
        title: 'Shared lentil soup',
        summary: '',
        status: 'active',
        servings: '4 servings',
        prepMinutes: 10,
        cookMinutes: 30,
        restMinutes: 0,
        difficulty: '',
        cuisine: '',
        category: '',
        tips: '',
        sharedNotes: '',
        createdByProfileId: householdProfileId,
        lastEditedByProfileId: householdProfileId,
        currentRevision: 1,
        createdAt: now,
        updatedAt: now,
      })
      .run();
    getDatabase()
      .insert(mealPlanEntries)
      .values({
        id: mealPlanEntryId,
        plannedFor: '2026-07-20',
        meal: 'dinner',
        recipeId,
        title: '',
        servings: 4,
        note: '',
        createdByProfileId: householdProfileId,
        updatedByProfileId: householdProfileId,
        createdAt: now,
        updatedAt: now,
      })
      .run();
    const source = createNutritionDataSource({
      sourceType: 'calculated',
      name: 'Projection calculator',
      provider: 'Our Recipes',
      version: '1',
      citation: 'Local deterministic calculation',
    });
    sourceId = source.id;
    const version = registerCalculationVersion({
      algorithm: 'ingredient-sum',
      version: '1',
      energyFactorsVersion: 'general-4-4-9-7-v1',
      implementationDigest: 'projection-v1',
    });
    appendRecipeNutritionCalculation({
      recipeId,
      recipeRevision: 1,
      calculationVersionId: version.id,
      sourceId: source.id,
      sourceDigest: 'projection-recipe-v1',
      servingCount: 4,
      confidence: 0.8,
      completeness: 0.7,
      values: [
        { nutrientCode: 'energy_kcal', amount: 1_600, confidence: 0.8, completeness: 0.7 },
        { nutrientCode: 'protein', amount: 80, confidence: 0.8, completeness: 0.7 },
        { nutrientCode: 'fiber', amount: 32, confidence: 0.8, completeness: 0.7 },
      ],
    });
  });

  function allocate(
    profileId: string,
    principalId: string,
    servings: number,
    previous?: ReturnType<typeof appendNutritionMealAllocationVersion>,
    state: 'planned' | 'served' | 'skipped' = 'planned',
  ) {
    return appendNutritionMealAllocationVersion(profileId, principalId, {
      seriesId: previous?.seriesId,
      supersedesAllocationVersionId: previous?.id ?? null,
      mealPlanEntryId,
      cookSessionId: null,
      state,
      servings,
      portionWeightGrams: null,
      intakeSeriesId: null,
      note: '',
    });
  }

  it('projects uneven fractional portions and exposes only hidden aggregate assignment', () => {
    const first = allocate(ownerProfileId, ownerPrincipalId, 1);
    allocate(ownerProfileId, ownerPrincipalId, 1.5, first, 'served');
    allocate(otherProfileId, otherPrincipalId, 1);

    const projection = getNutritionMealProjection(ownerProfileId, ownerPrincipalId, {
      start: '2026-07-19',
      end: '2026-07-25',
    });
    expect(projection.meals[0]).toMatchObject({
      assignedServings: 2.5,
      unassignedServings: 1.5,
      plannedServings: 2.5,
      calculationStatus: 'current',
      plannedValues: { energy_kcal: 1000, protein: 50, fiber: 20 },
    });
    expect(projection.meals[0]!.ownAllocations).toHaveLength(2);
    expect(JSON.stringify(projection)).not.toContain('Hidden other person');
    expect(JSON.stringify(projection)).not.toContain(otherProfileId);
    expect(JSON.stringify(projection)).not.toContain(otherPrincipalId);
  });

  it('uses five fixed queries for local confirmed totals and excludes non-planned meals', () => {
    allocate(ownerProfileId, ownerPrincipalId, 1);
    appendNutritionIntakeRevision(ownerProfileId, ownerPrincipalId, {
      occurredAt: '2026-07-20T06:30:00Z',
      mealSlot: 'dinner',
      state: 'eaten',
      sourceType: 'manual',
      sourceNameSnapshot: 'Outside local day',
      quantity: 1,
      unit: 'portion',
      provenance: {
        sourceIds: [sourceId],
        sourceDetails: [
          { id: sourceId, name: 'Projection calculator', provider: 'Our Recipes', version: '1' },
        ],
        calculationVersionId: null,
        sourceDigest: 'outside-local-day',
        basisType: 'manual_portion',
        basisAmount: 1,
        basisUnit: 'portion',
        confidence: 1,
        completeness: 1,
        estimated: false,
      },
      values: [
        {
          nutrientCode: 'energy_kcal',
          amount: 900,
          sourceIds: [sourceId],
          confidence: 1,
          completeness: 1,
          estimated: false,
        },
      ],
    });
    appendNutritionIntakeRevision(ownerProfileId, ownerPrincipalId, {
      occurredAt: '2026-07-20T07:30:00Z',
      mealSlot: 'breakfast',
      state: 'eaten',
      sourceType: 'manual',
      sourceNameSnapshot: 'Inside local day',
      quantity: 1,
      unit: 'portion',
      provenance: {
        sourceIds: [sourceId],
        sourceDetails: [
          { id: sourceId, name: 'Projection calculator', provider: 'Our Recipes', version: '1' },
        ],
        calculationVersionId: null,
        sourceDigest: 'inside-local-day',
        basisType: 'manual_portion',
        basisAmount: 1,
        basisUnit: 'portion',
        confidence: 1,
        completeness: 1,
        estimated: false,
      },
      values: [
        {
          nutrientCode: 'energy_kcal',
          amount: 500,
          sourceIds: [sourceId],
          confidence: 1,
          completeness: 1,
          estimated: false,
        },
      ],
    });
    const baseMeal = getDatabase()
      .select()
      .from(mealPlanEntries)
      .where(eq(mealPlanEntries.id, mealPlanEntryId))
      .get()!;
    getDatabase()
      .insert(mealPlanEntries)
      .values({
        ...baseMeal,
        id: crypto.randomUUID(),
        plannedFor: '2026-07-21',
        status: 'skipped',
      })
      .run();
    const oldMealIds = Array.from(
      { length: 200 },
      (_, index) => `bbbbbbbb-bbbb-4bbb-8bbb-${String(index).padStart(12, '0')}`,
    );
    getDatabase().transaction((transaction) => {
      for (const [index, id] of oldMealIds.entries()) {
        transaction
          .insert(mealPlanEntries)
          .values({
            ...baseMeal,
            id,
            plannedFor: '2020-01-01',
            status: 'planned',
          })
          .run();
        transaction
          .insert(nutritionMealAllocationVersions)
          .values({
            id: `cccccccc-cccc-4ccc-8ccc-${String(index).padStart(12, '0')}`,
            seriesId: `dddddddd-dddd-4ddd-8ddd-${String(index).padStart(12, '0')}`,
            revision: 1,
            nutritionProfileId: ownerProfileId,
            mealPlanEntryId: id,
            state: 'planned',
            servings: 1,
            portionWeightGrams: null,
            intakeSeriesId: null,
            note: '',
            createdByPrincipalId: ownerPrincipalId,
            actorHouseholdProfileId: ownerProfileId,
            createdAt: new Date('2020-01-01T00:00:00Z'),
          })
          .run();
      }
    });
    const prepare = vi.spyOn(getSqliteDatabase(), 'prepare');
    const started = performance.now();
    const projection = getNutritionMealProjection(ownerProfileId, ownerPrincipalId, {
      start: '2026-07-20',
      end: '2026-07-26',
    });
    expect(prepare).toHaveBeenCalledTimes(5);
    expect(performance.now() - started).toBeLessThan(2_000);
    expect(projection.meals).toHaveLength(1);
    expect(projection.confirmedTotalsByDate).toEqual({
      '2026-07-20': { energy_kcal: 500 },
    });
    expect(projection.meals[0]?.plannedValues).toMatchObject({ fiber: 8 });
  });

  it('uses latest state, rejects transactional over-allocation and preserves source identity', () => {
    const owner = allocate(ownerProfileId, ownerPrincipalId, 2.5);
    allocate(otherProfileId, otherPrincipalId, 1.5);
    expect(() => allocate(ownerProfileId, ownerPrincipalId, 3, owner)).toThrow(
      NutritionIntakeConflictError,
    );

    const otherMealId = crypto.randomUUID();
    getDatabase()
      .insert(mealPlanEntries)
      .values({
        id: otherMealId,
        plannedFor: '2026-07-21',
        meal: 'lunch',
        recipeId,
        title: '',
        servings: 4,
        note: '',
        createdByProfileId: getDatabase()
          .select()
          .from(recipes)
          .where(eq(recipes.id, recipeId))
          .get()!.createdByProfileId,
        updatedByProfileId: getDatabase()
          .select()
          .from(recipes)
          .where(eq(recipes.id, recipeId))
          .get()!.lastEditedByProfileId,
        createdAt: new Date(),
        updatedAt: new Date(),
      })
      .run();
    expect(() =>
      appendNutritionMealAllocationVersion(ownerProfileId, ownerPrincipalId, {
        seriesId: owner.seriesId,
        supersedesAllocationVersionId: owner.id,
        mealPlanEntryId: otherMealId,
        cookSessionId: null,
        state: 'planned',
        servings: 1,
        portionWeightGrams: null,
        intakeSeriesId: null,
        note: '',
      }),
    ).toThrow(NutritionIntakeConflictError);
  });

  it('does not project stale calculations and allows household reads', () => {
    allocate(ownerProfileId, ownerPrincipalId, 1);
    getDatabase().update(recipes).set({ currentRevision: 2 }).where(eq(recipes.id, recipeId)).run();
    const projection = getNutritionMealProjection(ownerProfileId, ownerPrincipalId, {
      start: '2026-07-19',
      end: '2026-07-25',
    });
    expect(projection.meals[0]).toMatchObject({
      calculationStatus: 'stale',
      plannedValues: null,
    });
    const stranger = createNutritionPrincipal('stranger projection secret');
    expect(
      getNutritionMealProjection(ownerProfileId, stranger.id, {
        start: '2026-07-19',
        end: '2026-07-25',
      }),
    ).toMatchObject({ meals: [expect.objectContaining({ calculationStatus: 'stale' })] });
  });
});
