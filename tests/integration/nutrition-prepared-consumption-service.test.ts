import { beforeEach, describe, expect, it, vi } from 'vitest';

vi.mock('server-only', () => ({}));

import { eq, sql } from 'drizzle-orm';

import { getDatabase, resetDatabaseForTests } from '@/lib/db/client';
import {
  cookSessions,
  mealPlanEntries,
  nutritionConsumptionCommands,
  nutritionIntakeRevisions,
  nutritionMealAllocationVersions,
  recipes,
} from '@/lib/db/schema';
import { completeSetup } from '@/lib/services/household-service';
import {
  appendRecipeNutritionCalculation,
  createNutritionDataSource,
  registerCalculationVersion,
} from '@/lib/services/nutrition-foundation-service';
import {
  NutritionPreparedConflictError,
  confirmPreparedRecipeConsumption,
  createPreparedRecipeInstance,
  getPreparedServingWorkspace,
  recordPreparedAllocationState,
} from '@/lib/services/nutrition-prepared-consumption-service';
import { createNutritionIdentity } from './nutrition-household-fixture';

describe('prepared recipe consumption transaction', () => {
  let profileId: string;
  let principalId: string;
  let recipeId: string;
  let calculationId: string;
  let mealPlanEntryId: string;
  let cookSessionId: string;

  beforeEach(() => {
    vi.stubEnv('DATABASE_URL', ':memory:');
    vi.stubEnv('DATA_DIR', './.test-data/nutrition-prepared-consumption');
    resetDatabaseForTests();
    const householdProfileId = completeSetup({
      householdName: 'Prepared household',
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
    const identity = createNutritionIdentity('prepared owner secret', {
      displayName: 'Private diner',
      linkedHouseholdProfileId: householdProfileId,
      dailyResetTimezone: 'America/Los_Angeles',
    });
    profileId = identity.profile.id;
    principalId = identity.principal.id;
    recipeId = crypto.randomUUID();
    mealPlanEntryId = crypto.randomUUID();
    cookSessionId = crypto.randomUUID();
    const now = new Date('2026-07-19T18:00:00Z');
    getDatabase()
      .insert(recipes)
      .values({
        id: recipeId,
        title: 'Original soup name',
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
        plannedFor: '2026-07-19',
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
    getDatabase()
      .insert(cookSessions)
      .values({
        id: cookSessionId,
        recipeId,
        profileId: householdProfileId,
        targetServings: 4,
        mealPlanEntryId,
        startedAt: now,
        completedAt: new Date('2026-07-19T19:00:00Z'),
      })
      .run();
    const source = createNutritionDataSource({
      sourceType: 'calculated',
      name: 'Prepared calculator',
      provider: 'Our Recipes',
      version: '1',
      citation: 'Deterministic test calculation',
    });
    const version = registerCalculationVersion({
      algorithm: 'ingredient-sum',
      version: '1',
      energyFactorsVersion: 'general-4-4-9-7-v1',
      implementationDigest: 'prepared-consumption-v1',
    });
    calculationId = appendRecipeNutritionCalculation({
      recipeId,
      recipeRevision: 1,
      calculationVersionId: version.id,
      sourceId: source.id,
      sourceDigest: 'prepared-calculation-v1',
      servingCount: 4,
      finalWeightGrams: 1_000,
      confidence: 0.8,
      completeness: 0.75,
      values: [
        { nutrientCode: 'energy_kcal', amount: 1_000, confidence: 0.8, completeness: 0.75 },
        { nutrientCode: 'protein', amount: 50, confidence: 0.8, completeness: 0.75 },
      ],
    }).id;
  });

  function createPrepared(
    overrides: Partial<Parameters<typeof createPreparedRecipeInstance>[2]> = {},
  ) {
    return createPreparedRecipeInstance(profileId, principalId, {
      preparedInstanceId: crypto.randomUUID(),
      recipeCalculationId: calculationId,
      mealPlanEntryId,
      cookSessionId,
      actualServings: 5,
      finalWeightGrams: 1_000,
      preparationMatchesCalculation: true,
      ...overrides,
    });
  }

  function consume(preparedId: string, key: string, servingCount = 1) {
    return confirmPreparedRecipeConsumption(profileId, preparedId, principalId, {
      idempotencyKey: key,
      servingCount,
      occurredAt: '2026-07-19T20:00:00-07:00',
      mealSlot: 'dinner',
      note: '',
    });
  }

  it('freezes prepared identity and atomically records actual-yield-scaled intake and allocation', () => {
    const prepared = createPrepared();
    getDatabase()
      .update(recipes)
      .set({ title: 'Renamed after cooking', currentRevision: 2 })
      .where(eq(recipes.id, recipeId))
      .run();

    const result = consume(prepared.id, 'prepared-command-001');
    expect(result.replayed).toBe(false);
    expect(result.intake).toMatchObject({
      sourceNameSnapshot: 'Original soup name',
      preparedRecipeInstanceId: prepared.id,
      mealPlanEntryId,
      cookSessionId,
      servingCount: 1,
    });
    expect(result.intake.values).toEqual(
      expect.arrayContaining([
        expect.objectContaining({ nutrientCode: 'energy_kcal', amount: 200 }),
        expect.objectContaining({ nutrientCode: 'protein', amount: 10 }),
      ]),
    );
    expect(result.allocation).toMatchObject({
      state: 'eaten',
      servings: 1,
      preparedRecipeInstanceId: prepared.id,
      intakeSeriesId: result.intake.seriesId,
    });
  });

  it('returns the exact pair on identical retry and rejects conflicting key reuse atomically', () => {
    const prepared = createPrepared();
    const first = consume(prepared.id, 'prepared-command-002', 0.5);
    const replay = consume(prepared.id, 'prepared-command-002', 0.5);
    expect(replay).toMatchObject({
      replayed: true,
      intake: { id: first.intake.id },
      allocation: { id: first.allocation.id },
    });
    expect(() => consume(prepared.id, 'prepared-command-002', 1)).toThrow(
      NutritionPreparedConflictError,
    );
    expect(
      getDatabase()
        .select({ count: sql<number>`count(*)` })
        .from(nutritionIntakeRevisions)
        .get()!.count,
    ).toBe(1);
    expect(
      getDatabase()
        .select({ count: sql<number>`count(*)` })
        .from(nutritionMealAllocationVersions)
        .get()!.count,
    ).toBe(1);
    expect(
      getDatabase()
        .select({ count: sql<number>`count(*)` })
        .from(nutritionConsumptionCommands)
        .get()!.count,
    ).toBe(1);
  });

  it('supports seconds, enforces actual prepared capacity and rejects mismatched preparation evidence', () => {
    const prepared = createPrepared();
    consume(prepared.id, 'prepared-command-003', 1.5);
    consume(prepared.id, 'prepared-command-004', 0.5);
    expect(() => consume(prepared.id, 'prepared-command-005', 3.1)).toThrow(
      NutritionPreparedConflictError,
    );
    expect(() =>
      createPrepared({
        preparedInstanceId: crypto.randomUUID(),
        cookSessionId: null,
        finalWeightGrams: 800,
      }),
    ).toThrow(NutritionPreparedConflictError);
  });

  it('records weighed intake from frozen final weight and enforces serving-equivalent capacity', () => {
    const prepared = createPrepared();
    const result = confirmPreparedRecipeConsumption(profileId, prepared.id, principalId, {
      idempotencyKey: 'prepared-weight-command-001',
      portionWeightGrams: 200,
      occurredAt: '2026-07-19T20:00:00-07:00',
      mealSlot: 'dinner',
      note: '',
    });
    expect(result.intake).toMatchObject({
      servingCount: null,
      portionWeightGrams: 200,
    });
    expect(result.intake.values).toEqual(
      expect.arrayContaining([
        expect.objectContaining({ nutrientCode: 'energy_kcal', amount: 200 }),
        expect.objectContaining({ nutrientCode: 'protein', amount: 10 }),
      ]),
    );
    expect(result.allocation).toMatchObject({ servings: 1, portionWeightGrams: 200 });
    expect(() =>
      confirmPreparedRecipeConsumption(profileId, prepared.id, principalId, {
        idempotencyKey: 'prepared-weight-command-002',
        portionWeightGrams: 801,
        occurredAt: '2026-07-19T20:05:00-07:00',
        mealSlot: 'dinner',
        note: '',
      }),
    ).toThrow(NutritionPreparedConflictError);
  });

  it('records idempotent served/skipped/leftover history and keeps other profile details private', () => {
    const prepared = createPrepared();
    const seriesId = crypto.randomUUID();
    const served = recordPreparedAllocationState(profileId, prepared.id, principalId, {
      allocationSeriesId: seriesId,
      state: 'served',
      servingCount: 0.75,
      note: 'Small bowl',
    });
    const replay = recordPreparedAllocationState(profileId, prepared.id, principalId, {
      allocationSeriesId: seriesId,
      state: 'served',
      servingCount: 0.75,
      note: 'Small bowl',
    });
    expect(replay).toMatchObject({ replayed: true, allocation: { id: served.allocation.id } });
    const skipped = recordPreparedAllocationState(profileId, prepared.id, principalId, {
      allocationSeriesId: seriesId,
      supersedesAllocationVersionId: served.allocation.id,
      state: 'skipped',
      servingCount: 0.75,
      note: 'Changed plans',
    });
    expect(skipped.allocation.revision).toBe(2);
    expect(() =>
      recordPreparedAllocationState(profileId, prepared.id, principalId, {
        allocationSeriesId: seriesId,
        supersedesAllocationVersionId: served.allocation.id,
        state: 'leftover',
        servingCount: 0.75,
        note: 'Changed meaning',
      }),
    ).toThrow(NutritionPreparedConflictError);

    const dependent = createNutritionIdentity('retired fixture', {
      displayName: 'Private dependent',
      profileType: 'dependent',
      dailyResetTimezone: 'America/Los_Angeles',
    }).profile;
    recordPreparedAllocationState(dependent.id, prepared.id, principalId, {
      allocationSeriesId: crypto.randomUUID(),
      state: 'leftover',
      servingCount: 1.25,
      note: 'Saved privately',
    });
    const workspace = getPreparedServingWorkspace(profileId, principalId);
    expect(workspace[0]).toMatchObject({ assignedServings: 1.25, remainingServings: 3.75 });
    expect(workspace[0]!.ownAllocations).toEqual([
      expect.objectContaining({ id: skipped.allocation.id, state: 'skipped' }),
    ]);
    expect(JSON.stringify(workspace)).not.toContain(dependent.id);
    expect(JSON.stringify(workspace)).not.toContain('Saved privately');
  });

  it('moves one served allocation to eaten atomically and prevents double consumption', () => {
    const prepared = createPrepared();
    const seriesId = crypto.randomUUID();
    const served = recordPreparedAllocationState(profileId, prepared.id, principalId, {
      allocationSeriesId: seriesId,
      state: 'served',
      servingCount: 1,
      note: '',
    });
    const eaten = confirmPreparedRecipeConsumption(profileId, prepared.id, principalId, {
      idempotencyKey: 'prepared-served-eaten-001',
      servingCount: 1,
      occurredAt: '2026-07-19T20:00:00-07:00',
      mealSlot: 'dinner',
      allocationSeriesId: seriesId,
      supersedesAllocationVersionId: served.allocation.id,
      note: '',
    });
    expect(eaten.allocation).toMatchObject({ state: 'eaten', revision: 2 });
    expect(() =>
      recordPreparedAllocationState(profileId, prepared.id, principalId, {
        allocationSeriesId: seriesId,
        supersedesAllocationVersionId: eaten.allocation.id,
        state: 'leftover',
        servingCount: 1,
        note: '',
      }),
    ).toThrow(NutritionPreparedConflictError);
    expect(() =>
      confirmPreparedRecipeConsumption(profileId, prepared.id, principalId, {
        idempotencyKey: 'prepared-served-eaten-002',
        servingCount: 1,
        occurredAt: '2026-07-19T20:05:00-07:00',
        mealSlot: 'dinner',
        allocationSeriesId: seriesId,
        supersedesAllocationVersionId: eaten.allocation.id,
        note: '',
      }),
    ).toThrow(NutritionPreparedConflictError);
  });
});
