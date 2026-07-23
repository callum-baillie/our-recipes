import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

vi.mock('server-only', () => ({}));

import { getSqliteDatabase, resetDatabaseForTests } from '@/lib/db/client';
import {
  NutritionProfileForbiddenError,
  appendNutritionPermission,
  recordBodyMeasurement,
} from '@/lib/services/nutrition-profile-service';
import { createNutritionIdentity, createNutritionPrincipal } from './nutrition-household-fixture';
import { getNutritionWeightTrendWorkspace } from '@/lib/services/nutrition-weight-trend-service';

describe('bounded authorized Nutrition weight workspace', () => {
  beforeEach(() => {
    vi.stubEnv('DATABASE_URL', ':memory:');
    vi.stubEnv('DATA_DIR', './.test-data/nutrition-weight-trend');
    resetDatabaseForTests();
  });

  afterEach(() => {
    resetDatabaseForTests();
    vi.unstubAllEnvs();
  });

  const request = { endDate: '2026-07-19', days: 7 as const };
  const grant = (
    principalId: string,
    permissions: Partial<{
      canViewDiary: boolean;
      canViewMeasurements: boolean;
      canManageProfile: boolean;
    }> = {},
  ) => ({
    principalId,
    role: 'viewer' as const,
    canViewDiary: false,
    canViewMeasurements: false,
    canManageProfile: false,
    canManageGoals: false,
    canViewComparison: false,
    canExportData: false,
    canDeleteData: false,
    expiresAt: null,
    ...permissions,
  });

  it('returns disabled without exposing a stored measurement when tracking is off', () => {
    const owner = createNutritionIdentity('disabled weight owner secret', {
      displayName: 'Private Avery',
      dailyResetTimezone: 'UTC',
    });
    recordBodyMeasurement(owner.profile.id, owner.principal.id, {
      measuredAt: '2026-07-19T08:00:00Z',
      weightKilograms: 70,
    });
    const prepare = vi.spyOn(getSqliteDatabase(), 'prepare');
    expect(
      getNutritionWeightTrendWorkspace(owner.profile.id, owner.principal.id, request),
    ).toMatchObject({ status: 'disabled', measurements: [] });
    expect(prepare).toHaveBeenCalledTimes(2);
  });

  it('allows household reads and rejects retired diary permissions', () => {
    const owner = createNutritionIdentity('weight owner secret', {
      displayName: 'Private Avery',
      dailyResetTimezone: 'UTC',
      weightTrackingEnabled: true,
    });
    const viewer = createNutritionPrincipal('weight viewer secret');
    expect(getNutritionWeightTrendWorkspace(owner.profile.id, viewer.id, request)).toMatchObject({
      status: 'enabled',
    });
    expect(() =>
      appendNutritionPermission(
        owner.profile.id,
        owner.principal.id,
        grant(viewer.id, { canViewDiary: true }),
      ),
    ).toThrow(NutritionProfileForbiddenError);
  });

  it('shows household observations and target while rejecting measurement permissions', () => {
    const owner = createNutritionIdentity('weight target owner secret', {
      displayName: 'Private Avery',
      dailyResetTimezone: 'UTC',
      weightTrackingEnabled: true,
      targetWeightKilograms: 68,
    });
    recordBodyMeasurement(owner.profile.id, owner.principal.id, {
      measuredAt: '2026-07-19T08:00:00Z',
      weightKilograms: 70,
      sourceType: 'imported',
      approximate: true,
    });
    const viewer = createNutritionPrincipal('weight measurement viewer secret');
    expect(() =>
      appendNutritionPermission(
        owner.profile.id,
        owner.principal.id,
        grant(viewer.id, { canViewMeasurements: true }),
      ),
    ).toThrow(NutritionProfileForbiddenError);
    const prepare = vi.spyOn(getSqliteDatabase(), 'prepare');
    const workspace = getNutritionWeightTrendWorkspace(owner.profile.id, viewer.id, request);
    expect(prepare).toHaveBeenCalledTimes(3);
    expect(workspace).toMatchObject({ status: 'enabled', targetWeightKilograms: null });
    expect(workspace.measurements).toEqual([
      expect.objectContaining({
        localDate: '2026-07-19',
        weightKilograms: 70,
        sourceType: 'imported',
        approximate: true,
      }),
    ]);
    expect(
      getNutritionWeightTrendWorkspace(owner.profile.id, owner.principal.id, request)
        .targetWeightKilograms,
    ).toBe(68);
  });

  it('rejects guardian permissions while household reads remain available', () => {
    const owner = createNutritionIdentity('weight manager owner secret', {
      displayName: 'Private Avery',
      dailyResetTimezone: 'UTC',
      weightTrackingEnabled: true,
      targetWeightKilograms: 65,
    });
    const manager = createNutritionPrincipal('weight manager secret');
    expect(() =>
      appendNutritionPermission(owner.profile.id, owner.principal.id, {
        ...grant(manager.id),
        role: 'guardian',
      }),
    ).toThrow(NutritionProfileForbiddenError);
    expect(getNutritionWeightTrendWorkspace(owner.profile.id, manager.id, request)).toMatchObject({
      targetWeightKilograms: null,
      status: 'enabled',
    });
  });

  it('filters the UTC envelope to exact profile-local dates near midnight', () => {
    const owner = createNutritionIdentity('weight timezone owner secret', {
      displayName: 'Private Avery',
      dailyResetTimezone: 'America/Los_Angeles',
      weightTrackingEnabled: true,
    });
    recordBodyMeasurement(owner.profile.id, owner.principal.id, {
      measuredAt: '2026-07-19T06:30:00Z',
      weightKilograms: 70,
    });
    recordBodyMeasurement(owner.profile.id, owner.principal.id, {
      measuredAt: '2026-07-19T07:30:00Z',
      weightKilograms: 71,
    });
    const workspace = getNutritionWeightTrendWorkspace(owner.profile.id, owner.principal.id, {
      endDate: '2026-07-18',
      days: 7,
    });
    expect(workspace.measurements).toEqual([
      expect.objectContaining({ localDate: '2026-07-18', weightKilograms: 70 }),
    ]);
  });
});
