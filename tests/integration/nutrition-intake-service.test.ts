import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

vi.mock('server-only', () => ({}));

import { getDatabase, getSqliteDatabase, resetDatabaseForTests } from '@/lib/db/client';
import { mealPlanEntries, recipes } from '@/lib/db/schema';
import { addProfile, completeSetup } from '@/lib/services/household-service';
import {
  appendRecipeNutritionCalculation,
  createNutritionDataSource,
  registerCalculationVersion,
} from '@/lib/services/nutrition-foundation-service';
import {
  NutritionIntakeForbiddenError,
  appendNutritionIntakeRevision,
  appendNutritionMealAllocationVersion,
  listNutritionIntakeRevisions,
  listNutritionMealAllocationVersions,
} from '@/lib/services/nutrition-intake-service';
import { appendNutritionPermission } from '@/lib/services/nutrition-profile-service';
import { createNutritionIdentity, createNutritionPrincipal } from './nutrition-household-fixture';

describe('private immutable Nutrition intake persistence', () => {
  let householdProfileId: string;
  let recipeId: string;
  let mealPlanEntryId: string;
  let sourceId: string;
  let calculationId: string;
  let calculationVersionId: string;
  let nutritionProfileId: string;
  let ownerPrincipalId: string;

  beforeEach(() => {
    vi.stubEnv('DATABASE_URL', ':memory:');
    vi.stubEnv('DATA_DIR', './.test-data/nutrition-intake-media');
    resetDatabaseForTests();
    householdProfileId = completeSetup({
      householdName: 'Private table',
      appName: 'Our Recipes',
      profile: {
        displayName: 'Household Avery',
        color: '#245b78',
        avatarUrl: '',
        units: 'metric',
        temperatureUnit: 'C',
        locale: 'en-US',
        timezone: 'America/Los_Angeles',
      },
    }).profiles[0]!.id;
    const identity = createNutritionIdentity('owner nutrition secret', {
      displayName: 'Private Avery',
      linkedHouseholdProfileId: householdProfileId,
      dailyResetTimezone: 'America/Los_Angeles',
    });
    nutritionProfileId = identity.profile.id;
    ownerPrincipalId = identity.principal.id;

    recipeId = crypto.randomUUID();
    mealPlanEntryId = crypto.randomUUID();
    const now = new Date('2026-07-19T18:00:00Z');
    getDatabase()
      .insert(recipes)
      .values({
        id: recipeId,
        title: 'Lentil soup',
        summary: '',
        status: 'active',
        servings: '4 bowls',
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
    const source = createNutritionDataSource({
      sourceType: 'calculated',
      name: 'Deterministic ingredient calculator',
      provider: 'Our Recipes',
      version: '1',
      citation: 'Local recipe calculation',
    });
    sourceId = source.id;
    const version = registerCalculationVersion({
      algorithm: 'ingredient-sum',
      version: '1',
      energyFactorsVersion: 'general-4-4-9-7-v1',
      implementationDigest: 'intake-test-v1',
    });
    calculationVersionId = version.id;
    calculationId = appendRecipeNutritionCalculation({
      recipeId,
      recipeRevision: 1,
      calculationVersionId,
      sourceId,
      sourceDigest: 'recipe-input-v1',
      servingCount: 4,
      confidence: 0.85,
      completeness: 0.6,
      values: [
        { nutrientCode: 'energy_kcal', amount: 1_600, confidence: 0.85, completeness: 0.6 },
        { nutrientCode: 'protein', amount: 80, confidence: 0.9, completeness: 0.8 },
      ],
    }).id;
  });

  afterEach(() => {
    resetDatabaseForTests();
    vi.unstubAllEnvs();
  });

  const recipeIntake = (amount: number, overrides: Record<string, unknown> = {}) => ({
    occurredAt: '2026-07-19T19:00:00-07:00',
    mealSlot: 'dinner' as const,
    state: 'eaten' as const,
    sourceType: 'recipe' as const,
    sourceNameSnapshot: 'Lentil soup',
    recipeId,
    recipeCalculationId: calculationId,
    servingCount: 1,
    provenance: {
      sourceIds: [sourceId],
      sourceDetails: [
        {
          id: sourceId,
          name: 'Deterministic ingredient calculator',
          provider: 'Our Recipes',
          version: '1',
          sourceRecordKey: '',
        },
      ],
      calculationVersionId,
      sourceDigest: 'recipe-input-v1',
      basisType: 'recipe_serving' as const,
      basisAmount: 1,
      basisUnit: 'serving',
      confidence: 0.85,
      completeness: 0.6,
      estimated: true,
    },
    values: [
      {
        nutrientCode: 'energy_kcal' as const,
        amount,
        sourceIds: [sourceId],
        confidence: 0.85,
        completeness: 0.6,
        estimated: true,
      },
    ],
    ...overrides,
  });

  it('appends corrections without changing the original nutrient snapshot', () => {
    const first = appendNutritionIntakeRevision(
      nutritionProfileId,
      ownerPrincipalId,
      recipeIntake(400),
    );
    const corrected = appendNutritionIntakeRevision(
      nutritionProfileId,
      ownerPrincipalId,
      recipeIntake(500, {
        state: 'corrected',
        supersedesIntakeRevisionId: first.id,
        revisionReason: 'The bowl was larger than one serving.',
        servingCount: 1.25,
      }),
    );
    expect(corrected).toMatchObject({ seriesId: first.seriesId, revision: 2, state: 'corrected' });
    const history = listNutritionIntakeRevisions(nutritionProfileId, ownerPrincipalId);
    expect(history.find((item) => item.id === first.id)?.values[0]?.amount).toBe(400);
    expect(history.find((item) => item.id === corrected.id)?.values[0]?.amount).toBe(500);
    expect(
      getSqliteDatabase()
        .prepare('SELECT amount FROM nutrition_intake_nutrient_values WHERE intake_revision_id=?')
        .get(first.id),
    ).toEqual({ amount: 400 });
  });

  it('does not allow a correction series to change source type', () => {
    const first = appendNutritionIntakeRevision(
      nutritionProfileId,
      ownerPrincipalId,
      recipeIntake(400),
    );
    expect(() =>
      appendNutritionIntakeRevision(
        nutritionProfileId,
        ownerPrincipalId,
        recipeIntake(1, {
          state: 'corrected',
          sourceType: 'manual',
          recipeId: null,
          recipeCalculationId: null,
          supersedesIntakeRevisionId: first.id,
          revisionReason: 'Attempted source-type bypass.',
        }),
      ),
    ).toThrow('preserve the original source type');
  });

  it('records skipped food with no nutrients and never derives intake from allocation state', () => {
    appendNutritionIntakeRevision(nutritionProfileId, ownerPrincipalId, {
      occurredAt: '2026-07-19T12:00:00-07:00',
      mealSlot: 'lunch',
      state: 'skipped',
      sourceType: 'manual',
    });
    const planned = appendNutritionMealAllocationVersion(nutritionProfileId, ownerPrincipalId, {
      mealPlanEntryId,
      state: 'planned',
      servings: 1,
    });
    expect(listNutritionIntakeRevisions(nutritionProfileId, ownerPrincipalId)).toHaveLength(1);
    expect(listNutritionIntakeRevisions(nutritionProfileId, ownerPrincipalId)[0]?.values).toEqual(
      [],
    );
    expect(listNutritionMealAllocationVersions(nutritionProfileId, ownerPrincipalId)).toEqual([
      expect.objectContaining({ id: planned.id, state: 'planned', intakeSeriesId: null }),
    ]);
  });

  it('allows household reads, denies ordinary cross-profile writes, and rejects permissions', () => {
    const legacy = createNutritionIdentity('legacy private owner secret', {
      displayName: 'Unlinked legacy profile',
      dailyResetTimezone: 'America/Los_Angeles',
    });
    const viewer = createNutritionPrincipal('viewer nutrition secret');
    expect(() =>
      appendNutritionPermission(legacy.profile.id, legacy.principal.id, {
        principalId: viewer.id,
        role: 'viewer',
        canViewDiary: true,
        canViewMeasurements: false,
        canManageProfile: false,
        canManageGoals: false,
        canViewComparison: false,
        canExportData: false,
        canDeleteData: false,
        expiresAt: null,
      }),
    ).toThrow();
    appendNutritionIntakeRevision(legacy.profile.id, legacy.principal.id, recipeIntake(400));
    expect(listNutritionIntakeRevisions(legacy.profile.id, viewer.id)).toHaveLength(1);
    expect(() =>
      appendNutritionIntakeRevision(legacy.profile.id, viewer.id, recipeIntake(400)),
    ).toThrow(NutritionIntakeForbiddenError);

    const guardian = createNutritionPrincipal('guardian nutrition secret');
    expect(() =>
      appendNutritionIntakeRevision(legacy.profile.id, guardian.id, {
        occurredAt: '2026-07-20T12:00:00-07:00',
        mealSlot: 'lunch',
        state: 'skipped',
        sourceType: 'manual',
      }),
    ).toThrow(NutritionIntakeForbiddenError);
  });

  it('shares a linked household diary read without allowing an ordinary cross-profile write', () => {
    const linkedHouseholdProfile = addProfile({
      displayName: 'Household Riley',
      color: '#654321',
      avatarUrl: '',
      units: 'metric',
      temperatureUnit: 'C',
      locale: 'en-US',
      timezone: 'America/New_York',
    });
    const linked = createNutritionIdentity('linked household secret', {
      displayName: 'Household Riley',
      linkedHouseholdProfileId: linkedHouseholdProfile.id,
      dailyResetTimezone: 'America/New_York',
    });
    appendNutritionIntakeRevision(linked.profile.id, linked.principal.id, {
      occurredAt: '2026-07-19T12:00:00-04:00',
      mealSlot: 'lunch',
      state: 'skipped',
      sourceType: 'manual',
    });
    expect(listNutritionIntakeRevisions(linked.profile.id, ownerPrincipalId)).toHaveLength(1);
    expect(() =>
      appendNutritionIntakeRevision(linked.profile.id, ownerPrincipalId, {
        occurredAt: '2026-07-20T12:00:00-04:00',
        mealSlot: 'lunch',
        state: 'skipped',
        sourceType: 'manual',
      }),
    ).toThrow(NutritionIntakeForbiddenError);
  });

  it('links an eaten allocation only after an explicit current intake exists', () => {
    const firstAllocation = appendNutritionMealAllocationVersion(
      nutritionProfileId,
      ownerPrincipalId,
      { mealPlanEntryId, state: 'served', servings: 1 },
    );
    const intake = appendNutritionIntakeRevision(
      nutritionProfileId,
      ownerPrincipalId,
      recipeIntake(400),
    );
    const eaten = appendNutritionMealAllocationVersion(nutritionProfileId, ownerPrincipalId, {
      supersedesAllocationVersionId: firstAllocation.id,
      mealPlanEntryId,
      state: 'eaten',
      servings: 1,
      intakeSeriesId: intake.seriesId,
    });
    expect(eaten).toMatchObject({ revision: 2, intakeSeriesId: intake.seriesId });
  });
});
