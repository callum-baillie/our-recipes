import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

vi.mock('server-only', () => ({}));

import { getDatabase, getSqliteDatabase, resetDatabaseForTests } from '@/lib/db/client';
import { nutritionPreparedRecipeInstances, recipes } from '@/lib/db/schema';
import { completeSetup } from '@/lib/services/household-service';
import {
  appendRecipeNutritionCalculation,
  createNutritionDataSource,
  registerCalculationVersion,
} from '@/lib/services/nutrition-foundation-service';
import {
  appendNutritionIntakeRevision,
  appendNutritionMealAllocationVersion,
  listNutritionIntakeRevisions,
} from '@/lib/services/nutrition-intake-service';
import {
  NutritionDiaryLifecycleConflictError,
  NutritionDiaryLifecycleForbiddenError,
  NutritionDiaryLifecycleIntegrityError,
  deletePrivateNutritionProfileData,
  executeNutritionDiaryCommand,
  exportPrivateNutritionProfile,
} from '@/lib/services/nutrition-diary-lifecycle-service';
import {
  appendNutritionGoalVersion,
  appendNutritionPermission,
  getPrivateNutritionProfile,
  NutritionProfileForbiddenError,
  recordBodyMeasurement,
  resolveNutritionPrincipal,
} from '@/lib/services/nutrition-profile-service';
import { createNutritionIdentity, createNutritionPrincipal } from './nutrition-household-fixture';

describe('private Nutrition diary lifecycle service', () => {
  let principalId: string;
  let sourceProfileId: string;
  let targetProfileId: string;
  let sourceId: string;
  let householdProfileId: string;

  beforeEach(() => {
    vi.stubEnv('DATABASE_URL', ':memory:');
    vi.stubEnv('DATA_DIR', './.test-data/nutrition-diary-lifecycle');
    resetDatabaseForTests();
    householdProfileId = completeSetup({
      householdName: 'Diary lifecycle household',
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
    const identity = createNutritionIdentity('private lifecycle owner secret', {
      displayName: 'Source diner',
      dailyResetTimezone: 'America/Los_Angeles',
      linkedHouseholdProfileId: householdProfileId,
    });
    principalId = identity.principal.id;
    sourceProfileId = identity.profile.id;
    targetProfileId = createNutritionIdentity('retired target fixture', {
      displayName: 'Target diner',
      profileType: 'dependent',
      dailyResetTimezone: 'America/New_York',
    }).profile.id;
    sourceId = createNutritionDataSource({
      sourceType: 'manual',
      name: 'User-entered label evidence',
      provider: 'Our Recipes',
      version: '1',
      citation: 'Private diary test',
    }).id;
  });

  afterEach(() => {
    resetDatabaseForTests();
    vi.unstubAllEnvs();
  });

  function addEntry(occurredAt = '2026-07-19T18:30:00-07:00') {
    return appendNutritionIntakeRevision(sourceProfileId, principalId, {
      occurredAt,
      mealSlot: 'dinner',
      state: 'eaten',
      sourceType: 'manual',
      sourceNameSnapshot: 'Private snack',
      quantity: 1,
      unit: 'portion',
      provenance: {
        sourceIds: [sourceId],
        sourceDetails: [
          {
            id: sourceId,
            name: 'User-entered label evidence',
            provider: 'Our Recipes',
            version: '1',
            sourceRecordKey: '',
          },
        ],
        calculationVersionId: null,
        sourceDigest: 'private-manual-snapshot-v1',
        basisType: 'manual_portion',
        basisAmount: 1,
        basisUnit: 'portion',
        confidence: 1,
        completeness: 0.4,
        estimated: false,
      },
      values: [
        {
          nutrientCode: 'energy_kcal',
          amount: 240,
          sourceIds: [sourceId],
          confidence: 1,
          completeness: 0.4,
          estimated: false,
        },
      ],
    });
  }

  it('copies from the frozen server snapshot and replays exactly once', () => {
    const source = addEntry();
    const command = {
      command: 'copy_entry',
      sourceRevisionId: source.id,
      targetProfileId: sourceProfileId,
      occurredAt: '2026-07-21T12:00:00-04:00',
      mealSlot: 'lunch',
      idempotencyKey: 'copy-service-0001',
    } as const;
    const first = executeNutritionDiaryCommand(sourceProfileId, principalId, command);
    const replay = executeNutritionDiaryCommand(sourceProfileId, principalId, command);
    expect(first.replayed).toBe(false);
    expect(replay).toEqual({ replayed: true, result: first.result });
    const copied = listNutritionIntakeRevisions(sourceProfileId, principalId);
    expect(copied).toHaveLength(2);
    expect(copied[0]).toMatchObject({ sourceNameSnapshot: 'Private snack', mealSlot: 'lunch' });
    expect(copied[0]!.values[0]).toMatchObject({ amount: 240, completeness: 0.4 });
    const exported = exportPrivateNutritionProfile(sourceProfileId, principalId);
    expect(exported).toContain('"target":"self"');
    expect(exported).not.toContain('copy-service-0001');
    expect(() =>
      executeNutritionDiaryCommand(sourceProfileId, principalId, {
        ...command,
        mealSlot: 'snack',
      }),
    ).toThrow(NutritionDiaryLifecycleConflictError);
  });

  it('moves, reassigns, and restores only by appending immutable revisions', () => {
    const source = addEntry();
    const moved = executeNutritionDiaryCommand(sourceProfileId, principalId, {
      command: 'move',
      sourceRevisionId: source.id,
      occurredAt: '2026-07-20T08:00:00-07:00',
      mealSlot: 'breakfast',
      reason: 'Logged under the wrong meal.',
      idempotencyKey: 'move-service-0001',
    });
    const movedId = (moved.result as { revisionId: string }).revisionId;
    const reassigned = executeNutritionDiaryCommand(sourceProfileId, principalId, {
      command: 'reassign',
      sourceRevisionId: movedId,
      targetProfileId,
      occurredAt: '2026-07-20T11:00:00-04:00',
      mealSlot: 'lunch',
      reason: 'The other diner ate this portion.',
      idempotencyKey: 'reassign-service-0001',
    });
    const deletedId = (reassigned.result as { sourceDeletionRevisionId: string })
      .sourceDeletionRevisionId;
    const sourceHistory = listNutritionIntakeRevisions(sourceProfileId, principalId);
    expect(sourceHistory).toHaveLength(3);
    expect(sourceHistory.find((row) => row.id === source.id)?.state).toBe('eaten');
    expect(sourceHistory.find((row) => row.id === movedId)).toMatchObject({
      state: 'corrected',
      mealSlot: 'breakfast',
    });
    expect(sourceHistory.find((row) => row.id === deletedId)?.state).toBe('deleted');
    expect(listNutritionIntakeRevisions(targetProfileId, principalId)).toHaveLength(1);

    executeNutritionDiaryCommand(sourceProfileId, principalId, {
      command: 'restore',
      sourceRevisionId: deletedId,
      reason: 'Reassignment was made in error.',
      idempotencyKey: 'restore-service-0001',
    });
    const restored = listNutritionIntakeRevisions(sourceProfileId, principalId).find(
      (row) => row.revision === 4,
    )!;
    expect(restored).toMatchObject({ state: 'corrected', revision: 4 });
    expect(restored.values[0]?.amount).toBe(240);
  });

  it('copies a local day atomically and emits a bounded secret-free export', () => {
    addEntry('2026-07-19T08:00:00-07:00');
    addEntry('2026-07-19T19:00:00-07:00');
    const copied = executeNutritionDiaryCommand(sourceProfileId, principalId, {
      command: 'copy_day',
      sourceDate: '2026-07-19',
      targetDate: '2026-07-22',
      targetProfileId: sourceProfileId,
      idempotencyKey: 'copy-day-service-0001',
    });
    expect((copied.result as { revisionIds: string[] }).revisionIds).toHaveLength(2);
    expect(listNutritionIntakeRevisions(sourceProfileId, principalId)).toHaveLength(4);
    const exported = exportPrivateNutritionProfile(sourceProfileId, principalId);
    expect(JSON.parse(exported)).toMatchObject({
      format: 'bord-private-nutrition-v1',
      profile: { id: sourceProfileId, displayName: 'Source diner' },
    });
    expect(exported).not.toContain('private lifecycle owner secret');
    expect(exported).not.toContain('credentialHash');
  });

  it('authorizes both source and target profiles before any cross-profile copy', () => {
    const source = addEntry();
    const privateTarget = createNutritionIdentity('other private identity secret', {
      displayName: 'Other private diner',
    });
    expect(() =>
      executeNutritionDiaryCommand(sourceProfileId, principalId, {
        command: 'copy_entry',
        sourceRevisionId: source.id,
        targetProfileId: privateTarget.profile.id,
        occurredAt: '2026-07-21T12:00:00Z',
        mealSlot: 'lunch',
        idempotencyKey: 'forbidden-copy-service-0001',
      }),
    ).toThrow(NutritionProfileForbiddenError);
    expect(listNutritionIntakeRevisions(sourceProfileId, principalId)).toHaveLength(1);
  });

  it('rejects an oversized selected-profile export at the count preflight', () => {
    getSqliteDatabase()
      .prepare(
        `WITH RECURSIVE rows(value) AS (
           SELECT 1 UNION ALL SELECT value + 1 FROM rows WHERE value < 50001
         )
         INSERT INTO nutrition_body_measurements (
           id, nutrition_profile_id, measured_at, weight_kilograms, source_type,
           approximate, note, created_by_principal_id, actor_household_profile_id, created_at
         )
         SELECT 'bulk-' || value, ?, value, 70, 'manual', 0, '', ?, ?, value FROM rows`,
      )
      .run(sourceProfileId, principalId, householdProfileId);
    expect(() => exportPrivateNutritionProfile(sourceProfileId, principalId)).toThrow(
      NutritionDiaryLifecycleIntegrityError,
    );
  });

  it('retires profile deletion without mutating the linked household data', () => {
    const source = addEntry();
    const copied = executeNutritionDiaryCommand(sourceProfileId, principalId, {
      command: 'copy_entry',
      sourceRevisionId: source.id,
      targetProfileId: sourceProfileId,
      occurredAt: '2026-07-21T12:00:00Z',
      mealSlot: 'lunch',
      idempotencyKey: 'copy-before-delete-0001',
    });
    appendNutritionGoalVersion(sourceProfileId, principalId, {
      nutrientCode: 'energy_kcal',
      unit: 'kcal',
      sourceType: 'user_defined',
      startsOn: '2026-07-19',
      kind: 'target',
      value: 2000,
    });
    recordBodyMeasurement(sourceProfileId, principalId, {
      measuredAt: '2026-07-19T12:00:00Z',
      weightKilograms: 70,
      note: 'Private measurement note',
    });
    const sqlite = getSqliteDatabase();
    const profileBeforeRetiredDeletion = sqlite
      .prepare(
        'SELECT display_name, date_of_birth, archived_at, version FROM nutrition_profiles WHERE id=?',
      )
      .get(sourceProfileId);

    expect(() =>
      deletePrivateNutritionProfileData(sourceProfileId, principalId, {
        confirmation: 'DELETE wrong name',
        expectedVersion: 1,
      }),
    ).toThrow(NutritionDiaryLifecycleForbiddenError);
    expect(listNutritionIntakeRevisions(sourceProfileId, principalId)).toHaveLength(2);

    expect(() =>
      deletePrivateNutritionProfileData(sourceProfileId, principalId, {
        confirmation: 'DELETE Source diner',
        expectedVersion: 1,
      }),
    ).toThrow();
    expect(getPrivateNutritionProfile(sourceProfileId, principalId).id).toBe(sourceProfileId);
    expect(
      sqlite
        .prepare(
          'SELECT display_name, date_of_birth, archived_at, version FROM nutrition_profiles WHERE id=?',
        )
        .get(sourceProfileId),
    ).toEqual(profileBeforeRetiredDeletion);
    expect(
      sqlite
        .prepare(
          'SELECT COUNT(*) AS count FROM nutrition_intake_revisions WHERE nutrition_profile_id=?',
        )
        .get(sourceProfileId),
    ).toEqual({ count: 2 });
    expect(
      sqlite
        .prepare(
          'SELECT COUNT(*) AS count FROM nutrition_goal_versions WHERE nutrition_profile_id=?',
        )
        .get(sourceProfileId),
    ).toEqual({ count: 1 });
    expect(
      sqlite
        .prepare(
          'SELECT COUNT(*) AS count FROM nutrition_body_measurements WHERE nutrition_profile_id=?',
        )
        .get(sourceProfileId),
    ).toEqual({ count: 1 });
    expect(
      sqlite
        .prepare(
          'SELECT COUNT(*) AS count FROM nutrition_diary_commands WHERE source_profile_id=? OR target_profile_id=?',
        )
        .get(sourceProfileId, sourceProfileId),
    ).toEqual({ count: 1 });
    expect(listNutritionIntakeRevisions(sourceProfileId, principalId)).toEqual(
      expect.arrayContaining([
        expect.objectContaining({ id: (copied.result as { revisionId: string }).revisionId }),
      ]),
    );
    expect(resolveNutritionPrincipal(principalId, 1)).not.toBeNull();
    expect(() =>
      appendNutritionIntakeRevision(sourceProfileId, principalId, {
        occurredAt: '2026-07-22T12:00:00Z',
        mealSlot: 'lunch',
        state: 'skipped',
        sourceType: 'manual',
      }),
    ).not.toThrow();
    expect(() =>
      appendNutritionMealAllocationVersion(sourceProfileId, principalId, {
        mealPlanEntryId: '99999999-9999-4999-8999-999999999999',
        state: 'planned',
        servings: 1,
      }),
    ).toThrow();
  });

  it('invalidates the owner credential when its last managed profile is deleted', () => {
    const identity = createNutritionIdentity('single profile private secret', {
      displayName: 'Single profile',
    });
    expect(() =>
      deletePrivateNutritionProfileData(identity.profile.id, identity.principal.id, {
        confirmation: 'DELETE Single profile',
        expectedVersion: 1,
      }),
    ).toThrow();
    expect(
      resolveNutritionPrincipal(identity.principal.id, identity.principal.accessVersion),
    ).not.toBeNull();
  });

  it('does not invalidate the authorized guardian session when the owner credential is archived', () => {
    const owner = createNutritionIdentity('guardian deletion owner secret', {
      displayName: 'Guardian managed profile',
    });
    const guardian = createNutritionPrincipal('guardian deletion actor secret');
    expect(() =>
      appendNutritionPermission(owner.profile.id, owner.principal.id, {
        principalId: guardian.id,
        role: 'guardian',
        canViewDiary: false,
        canViewMeasurements: false,
        canManageProfile: false,
        canManageGoals: false,
        canViewComparison: false,
        canExportData: false,
        canDeleteData: false,
        expiresAt: null,
      }),
    ).toThrow();
    expect(() =>
      deletePrivateNutritionProfileData(owner.profile.id, guardian.id, {
        confirmation: 'DELETE Guardian managed profile',
        expectedVersion: 1,
      }),
    ).toThrow();
    expect(
      resolveNutritionPrincipal(owner.principal.id, owner.principal.accessVersion),
    ).not.toBeNull();
    expect(resolveNutritionPrincipal(guardian.id, guardian.accessVersion)).not.toBeNull();
  });

  it('preserves shared prepared evidence and household recipes while scrubbing its private note', () => {
    const now = new Date('2026-07-19T12:00:00Z');
    const recipeId = crypto.randomUUID();
    getDatabase()
      .insert(recipes)
      .values({
        id: recipeId,
        title: 'Shared prepared soup',
        summary: '',
        status: 'active',
        servings: '2 servings',
        prepMinutes: 0,
        cookMinutes: 20,
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
    const version = registerCalculationVersion({
      algorithm: 'ingredient-sum',
      version: '1',
      energyFactorsVersion: 'general-4-4-9-7-v1',
      implementationDigest: 'deletion-shared-prepared-v1',
    });
    const calculation = appendRecipeNutritionCalculation({
      recipeId,
      recipeRevision: 1,
      calculationVersionId: version.id,
      sourceId,
      sourceDigest: 'shared-prepared-source-v1',
      servingCount: 2,
      confidence: 1,
      completeness: 1,
      values: [{ nutrientCode: 'energy_kcal', amount: 400, confidence: 1, completeness: 1 }],
    });
    const preparedId = crypto.randomUUID();
    getDatabase()
      .insert(nutritionPreparedRecipeInstances)
      .values({
        id: preparedId,
        recipeId,
        recipeCalculationId: calculation.id,
        recipeNameSnapshot: 'Shared prepared soup',
        actualServings: 2,
        calculationAlignment: 'as_calculated',
        includedOptionalIngredientIdsSnapshot: '[]',
        adjustmentsSnapshot: '[]',
        note: 'Private preparation note',
        requestDigest: 'shared-prepared-request-v1',
        createdByPrincipalId: principalId,
        actorHouseholdProfileId: householdProfileId,
        createdAt: now,
      })
      .run();
    const source = addEntry();
    getSqliteDatabase()
      .prepare('UPDATE nutrition_intake_revisions SET prepared_recipe_instance_id=? WHERE id=?')
      .run(preparedId, source.id);
    executeNutritionDiaryCommand(sourceProfileId, principalId, {
      command: 'copy_entry',
      sourceRevisionId: source.id,
      targetProfileId: sourceProfileId,
      occurredAt: '2026-07-21T12:00:00Z',
      mealSlot: 'lunch',
      idempotencyKey: 'shared-prepared-copy-0001',
    });

    expect(() =>
      deletePrivateNutritionProfileData(sourceProfileId, principalId, {
        confirmation: 'DELETE Source diner',
        expectedVersion: 1,
      }),
    ).toThrow();
    expect(
      getSqliteDatabase()
        .prepare('SELECT note FROM nutrition_prepared_recipe_instances WHERE id=?')
        .get(preparedId),
    ).toEqual({ note: 'Private preparation note' });
    expect(
      getSqliteDatabase().prepare('SELECT title FROM recipes WHERE id=?').get(recipeId),
    ).toEqual({ title: 'Shared prepared soup' });
    expect(listNutritionIntakeRevisions(sourceProfileId, principalId)).toEqual(
      expect.arrayContaining([expect.objectContaining({ preparedRecipeInstanceId: preparedId })]),
    );
  });
});
