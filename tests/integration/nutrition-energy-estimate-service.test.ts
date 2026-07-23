import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
vi.mock('server-only', () => ({}));

import { resetDatabaseForTests } from '@/lib/db/client';
import { previewOrApplyNutritionEnergyEstimate } from '@/lib/services/nutrition-energy-estimate-service';
import {
  NutritionProfileConflictError,
  NutritionProfileForbiddenError,
  appendNutritionGoalVersion,
  appendNutritionPermission,
  listNutritionGoalVersions,
} from '@/lib/services/nutrition-profile-service';
import { createNutritionIdentity, createNutritionPrincipal } from './nutrition-household-fixture';

describe('adult Nutrition energy estimate service', () => {
  beforeEach(() => {
    vi.stubEnv('DATABASE_URL', ':memory:');
    vi.stubEnv('DATA_DIR', './.test-data/nutrition-energy-estimate');
    resetDatabaseForTests();
  });
  afterEach(() => {
    resetDatabaseForTests();
    vi.unstubAllEnvs();
  });

  function identity() {
    return createNutritionIdentity('adult energy owner secret', {
      displayName: 'Adult estimate',
      dateOfBirth: '1990-04-03',
      heightCentimeters: 170,
      currentWeightKilograms: 70,
      referenceSexCategory: 'female',
      activityLevel: 'moderate',
      estimatedTargetsEnabled: true,
      estimatedTargetConsent: true,
      dailyResetTimezone: 'America/Los_Angeles',
    });
  }

  it('previews without mutation, applies with exact source evidence and replays exactly once', () => {
    const owner = identity();
    const preview = previewOrApplyNutritionEnergyEstimate(owner.profile.id, owner.principal.id, {
      action: 'preview',
      expectedProfileVersion: 1,
      effectiveOn: '2026-07-19',
      palCategory: 'active',
    });
    expect(preview).toMatchObject({ action: 'previewed', goal: null, currentEnergyGoals: [] });
    expect(preview.estimate!.palCategory).toBe('active');
    expect(listNutritionGoalVersions(owner.profile.id, owner.principal.id)).toHaveLength(0);

    const operationId = '33333333-3333-4333-8333-333333333333';
    const request = {
      action: 'apply' as const,
      expectedProfileVersion: 1,
      effectiveOn: '2026-07-19',
      palCategory: 'active' as const,
      operationId,
      supersedesGoalVersionId: null,
    };
    const applied = previewOrApplyNutritionEnergyEstimate(
      owner.profile.id,
      owner.principal.id,
      request,
    );
    expect(applied.goal).toMatchObject({
      id: operationId,
      nutrientCode: 'energy_kcal',
      sourceType: 'reference',
      sourceReferenceId: 'nasem-eer-2023-table-5-16',
    });
    expect(JSON.parse(applied.goal!.note)).toMatchObject({
      pal: 'active',
      profileVersion: 1,
      rounding: 'nearest_whole_kcal',
    });
    expect(
      previewOrApplyNutritionEnergyEstimate(owner.profile.id, owner.principal.id, request).goal!.id,
    ).toBe(operationId);
    expect(listNutritionGoalVersions(owner.profile.id, owner.principal.id)).toHaveLength(1);
    expect(() =>
      previewOrApplyNutritionEnergyEstimate(owner.profile.id, owner.principal.id, {
        ...request,
        palCategory: 'inactive',
      }),
    ).toThrow(/different evidence/iu);
  });

  it('requires explicit latest-goal supersession and denies an unrelated principal', () => {
    const owner = identity();
    const manual = appendNutritionGoalVersion(owner.profile.id, owner.principal.id, {
      nutrientCode: 'energy_kcal',
      unit: 'kcal',
      sourceType: 'user_defined',
      startsOn: '2026-01-01',
      kind: 'target',
      value: 2_000,
    });
    const base = {
      action: 'apply' as const,
      expectedProfileVersion: 1,
      effectiveOn: '2026-07-19',
      palCategory: 'inactive' as const,
      operationId: '44444444-4444-4444-8444-444444444444',
      supersedesGoalVersionId: null,
    };
    expect(() =>
      previewOrApplyNutritionEnergyEstimate(owner.profile.id, owner.principal.id, base),
    ).toThrow(NutritionProfileConflictError);
    const applied = previewOrApplyNutritionEnergyEstimate(owner.profile.id, owner.principal.id, {
      ...base,
      supersedesGoalVersionId: manual.id,
    });
    expect(applied.goal!.supersedesGoalVersionId).toBe(manual.id);
    expect(applied.goal!.seriesId).toBe(manual.seriesId);
    expect(listNutritionGoalVersions(owner.profile.id, owner.principal.id)).toHaveLength(2);
    const stranger = createNutritionPrincipal('energy estimate stranger secret');
    expect(() =>
      previewOrApplyNutritionEnergyEstimate(owner.profile.id, stranger.id, {
        action: 'preview',
        expectedProfileVersion: 1,
        effectiveOn: '2026-07-19',
        palCategory: 'inactive',
      }),
    ).toThrow(NutritionProfileForbiddenError);
  });

  it('requires consent, current profile evidence, supported life stage and both management rights', () => {
    const noConsent = createNutritionIdentity('energy no consent secret', {
      displayName: 'No consent',
      dailyResetTimezone: 'UTC',
    });
    const preview = {
      action: 'preview' as const,
      expectedProfileVersion: 1,
      effectiveOn: '2026-07-19',
      palCategory: 'inactive' as const,
    };
    expect(() =>
      previewOrApplyNutritionEnergyEstimate(noConsent.profile.id, noConsent.principal.id, preview),
    ).toThrow(/explicitly consent/iu);

    const pregnant = createNutritionIdentity('energy life stage secret', {
      displayName: 'Explicit life stage',
      dateOfBirth: '1990-04-03',
      heightCentimeters: 170,
      currentWeightKilograms: 70,
      referenceSexCategory: 'female',
      activityLevel: 'active',
      explicitlyEnteredLifeStage: 'pregnant',
      estimatedTargetsEnabled: true,
      estimatedTargetConsent: true,
      dailyResetTimezone: 'UTC',
    });
    expect(() =>
      previewOrApplyNutritionEnergyEstimate(pregnant.profile.id, pregnant.principal.id, preview),
    ).toThrow(/not supported/iu);
    expect(() =>
      previewOrApplyNutritionEnergyEstimate(pregnant.profile.id, pregnant.principal.id, {
        ...preview,
        expectedProfileVersion: 2,
      }),
    ).toThrow(NutritionProfileConflictError);

    const owner = identity();
    const profileOnlyManager = createNutritionPrincipal('profile only manager secret');
    expect(() =>
      appendNutritionPermission(owner.profile.id, owner.principal.id, {
        principalId: profileOnlyManager.id,
        role: 'viewer',
        canViewDiary: false,
        canViewMeasurements: false,
        canManageProfile: true,
        canManageGoals: false,
        canViewComparison: false,
        canExportData: false,
        canDeleteData: false,
        expiresAt: null,
      }),
    ).toThrow(NutritionProfileForbiddenError);
    expect(() =>
      previewOrApplyNutritionEnergyEstimate(owner.profile.id, profileOnlyManager.id, preview),
    ).toThrow(NutritionProfileForbiddenError);
  });
});
