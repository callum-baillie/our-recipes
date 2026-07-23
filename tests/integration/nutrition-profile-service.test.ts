import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
vi.mock('server-only', () => ({}));
import { getSqliteDatabase, resetDatabaseForTests } from '@/lib/db/client';
import {
  NutritionProfileConflictError,
  NutritionProfileForbiddenError,
  appendNutritionGoalVersion,
  appendNutritionPermission,
  authenticateNutritionPrincipal,
  createManagedNutritionProfile,
  createNutritionIdentity as createRetiredNutritionIdentity,
  createNutritionPrincipal as createRetiredNutritionPrincipal,
  getPrivateNutritionProfile,
  listBodyMeasurements,
  listNutritionGoalVersions,
  listAccessibleNutritionProfiles,
  recordBodyMeasurement,
  revokeNutritionPermission,
  rotateNutritionAccessSecret,
  selectAccessibleNutritionProfile,
  updateNutritionProfileSettings,
} from '@/lib/services/nutrition-profile-service';
import { createNutritionIdentity, createNutritionPrincipal } from './nutrition-household-fixture';

describe('private Nutrition profile persistence', () => {
  beforeEach(() => {
    vi.stubEnv('DATABASE_URL', ':memory:');
    vi.stubEnv('DATA_DIR', './.test-data/nutrition-profile-media');
    resetDatabaseForTests();
  });
  afterEach(() => {
    resetDatabaseForTests();
    vi.unstubAllEnvs();
  });
  const profileInput = (displayName = 'Private Avery') => ({
    displayName,
    dailyResetTimezone: 'America/Los_Angeles',
  });

  it('uses retired sentinels and rejects credential creation, authentication, and rotation', () => {
    const created = createNutritionIdentity('correct horse battery staple', profileInput());
    const stored = getSqliteDatabase()
      .prepare('SELECT credential_hash FROM nutrition_principals WHERE id=?')
      .get(created.principal.id) as { credential_hash: string };
    expect(stored.credential_hash).toBe('retired:actor-context-only:v1');
    expect(stored.credential_hash).not.toContain('correct horse');
    expect(authenticateNutritionPrincipal(created.principal.id, 'wrong secret')).toBeNull();
    expect(() =>
      rotateNutritionAccessSecret(
        created.principal.id,
        'correct horse battery staple',
        'a completely new private secret',
        1,
      ),
    ).toThrow(NutritionProfileForbiddenError);
    expect(() => createRetiredNutritionIdentity('secret', profileInput())).toThrow(
      NutritionProfileForbiddenError,
    );
    expect(() => createRetiredNutritionPrincipal('secret')).toThrow(NutritionProfileForbiddenError);
  });

  it('denies by default and rejects new permission history', () => {
    const owner = createNutritionIdentity('owner private secret', profileInput());
    const viewer = createNutritionPrincipal('viewer private secret');
    expect(() => getPrivateNutritionProfile(owner.profile.id, viewer.id)).toThrow(
      NutritionProfileForbiddenError,
    );
    recordBodyMeasurement(owner.profile.id, owner.principal.id, {
      measuredAt: '2026-07-18T08:00:00-07:00',
      weightKilograms: 70,
    });
    expect(() =>
      appendNutritionPermission(owner.profile.id, owner.principal.id, {
        principalId: viewer.id,
        role: 'viewer',
        canViewDiary: false,
        canViewMeasurements: true,
        canManageProfile: false,
        canManageGoals: false,
        canViewComparison: false,
        canExportData: false,
        canDeleteData: false,
        expiresAt: null,
      }),
    ).toThrow(NutritionProfileForbiddenError);
    expect(() =>
      revokeNutritionPermission(owner.profile.id, owner.principal.id, viewer.id),
    ).toThrow(NutritionProfileForbiddenError);
    expect(listBodyMeasurements(owner.profile.id, viewer.id)).toHaveLength(1);
    expect(
      (
        getSqliteDatabase()
          .prepare('SELECT COUNT(*) AS count FROM nutrition_permission_versions')
          .get() as { count: number }
      ).count,
    ).toBe(0);
  });

  it('uses optimistic versions for sensitive current profile settings', () => {
    const owner = createNutritionIdentity('owner private secret', profileInput());
    const updated = updateNutritionProfileSettings(owner.profile.id, owner.principal.id, 1, {
      dailyResetTimezone: 'America/Los_Angeles',
      foodAllergies: ['Peanuts'],
      visibleNutrientCodes: ['fiber', 'sodium'],
      trendRangeDays: 14,
      showPlannedNutrition: false,
      showRecipeCardNutrition: false,
      recipeCardNutrientCodes: ['carbohydrate', 'total_fat'],
      showMealPlanNutrition: false,
    });
    expect(updated).toMatchObject({
      displayName: 'Private Avery',
      version: 2,
      foodAllergies: '["Peanuts"]',
      visibleNutrientCodes: '["fiber","sodium"]',
      trendRangeDays: 14,
      showPlannedNutrition: false,
      showRecipeCardNutrition: false,
      recipeCardNutrientCodes: '["carbohydrate","total_fat"]',
      showMealPlanNutrition: false,
    });
    expect(listAccessibleNutritionProfiles(owner.principal.id)[0]).toMatchObject({
      showRecipeCardNutrition: false,
      recipeCardNutrientCodes: ['carbohydrate', 'total_fat'],
      showMealPlanNutrition: false,
    });
    const accessible = listAccessibleNutritionProfiles(owner.principal.id);
    expect(selectAccessibleNutritionProfile(accessible, owner.profile.id)?.id).toBe(
      owner.profile.id,
    );
    expect(
      selectAccessibleNutritionProfile(accessible, 'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa')?.id,
    ).toBe(owner.profile.id);
    expect(() =>
      updateNutritionProfileSettings(owner.profile.id, owner.principal.id, 1, {
        dailyResetTimezone: 'UTC',
      }),
    ).toThrow(NutritionProfileConflictError);
  });

  it('appends reference-linked goal versions and immutable measurements', () => {
    const owner = createNutritionIdentity('owner private secret', profileInput());
    const first = appendNutritionGoalVersion(owner.profile.id, owner.principal.id, {
      nutrientCode: 'protein',
      unit: 'g',
      sourceType: 'reference',
      sourceReferenceId: 'fda-daily-values-adults-children-4-plus-retrieved-2026-07-18:protein',
      startsOn: '2026-07-18',
      kind: 'minimum',
      value: 50,
    });
    appendNutritionGoalVersion(
      owner.profile.id,
      owner.principal.id,
      {
        nutrientCode: 'protein',
        unit: 'g',
        sourceType: 'user_defined',
        startsOn: '2026-08-01',
        kind: 'minimum',
        value: 60,
      },
      { supersedesGoalVersionId: first.id },
    );
    recordBodyMeasurement(owner.profile.id, owner.principal.id, {
      measuredAt: '2026-07-18T08:00:00-07:00',
      weightKilograms: 70,
      approximate: true,
    });
    recordBodyMeasurement(owner.profile.id, owner.principal.id, {
      measuredAt: '2026-07-19T08:00:00-07:00',
      weightKilograms: 69.8,
    });
    expect(
      listNutritionGoalVersions(owner.profile.id, owner.principal.id).map((goal) => goal.revision),
    ).toEqual([1, 2]);
    expect(
      listBodyMeasurements(owner.profile.id, owner.principal.id).map(
        (item) => item.weightKilograms,
      ),
    ).toEqual([69.8, 70]);
  });

  it('rejects legacy managed-profile creation and lists only exact linked profiles', () => {
    const owner = createNutritionIdentity('owner private secret', profileInput());
    expect(() =>
      createManagedNutritionProfile(owner.principal.id, {
        displayName: 'Dependent Riley',
        profileType: 'dependent',
      }),
    ).toThrow(NutritionProfileForbiddenError);
    const summaries = listAccessibleNutritionProfiles(owner.principal.id);
    expect(summaries.map((profile) => profile.displayName)).toEqual(['Private Avery']);
  });
});
