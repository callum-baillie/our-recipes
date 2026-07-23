import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

vi.mock('server-only', () => ({}));

import { getSqliteDatabase, resetDatabaseForTests } from '@/lib/db/client';
import { addProfile, completeSetup, updateProfile } from '@/lib/services/household-service';
import { resolveNutritionHouseholdContext } from '@/lib/services/nutrition-household-profile-service';

describe('Nutrition household profile convergence', () => {
  beforeEach(() => {
    vi.stubEnv('DATABASE_URL', ':memory:');
    resetDatabaseForTests();
  });
  afterEach(() => {
    resetDatabaseForTests();
    vi.unstubAllEnvs();
  });

  it('provisions exactly one Nutrition profile for each household profile and follows ActorContext', () => {
    const state = completeSetup({
      householdName: 'Household',
      appName: 'Our Recipes',
      profile: {
        displayName: 'Avery',
        color: '#123456',
        avatarUrl: '',
        units: 'metric',
        temperatureUnit: 'C',
        locale: 'en-US',
        timezone: 'UTC',
      },
    });
    const riley = addProfile({
      displayName: 'Riley',
      color: '#654321',
      avatarUrl: '',
      units: 'imperial',
      temperatureUnit: 'F',
      locale: 'en-US',
      timezone: 'America/New_York',
    });
    const first = resolveNutritionHouseholdContext({
      profileId: state.profiles[0]!.id,
      source: 'profile-cookie',
    });
    const second = resolveNutritionHouseholdContext({
      profileId: riley.id,
      source: 'profile-cookie',
    });
    expect(first.householdNutritionProfiles).toHaveLength(2);
    expect(second.householdNutritionProfiles).toHaveLength(2);
    expect(first.activeNutritionProfile.linkedHouseholdProfileId).toBe(state.profiles[0]!.id);
    expect(second.activeNutritionProfile.linkedHouseholdProfileId).toBe(riley.id);
    expect(second.activeNutritionProfile.measurementSystem).toBe('imperial');
    expect(second.compatibilityPrincipalId).not.toBe(first.compatibilityPrincipalId);
  });

  it('synchronizes only current linked display fields with an optimistic version', () => {
    const state = completeSetup({
      householdName: 'Household',
      appName: 'Our Recipes',
      profile: {
        displayName: 'Avery',
        color: '#123456',
        avatarUrl: '',
        units: 'metric',
        temperatureUnit: 'C',
        locale: 'en-US',
        timezone: 'UTC',
      },
    });
    const actor = { profileId: state.profiles[0]!.id, source: 'profile-cookie' as const };
    const before = resolveNutritionHouseholdContext(actor).activeNutritionProfile;
    updateProfile(state.profiles[0]!.id, {
      displayName: 'Avery Household',
      color: '#abcdef',
      avatarUrl: 'https://example.com/avery.png',
      units: 'imperial',
      temperatureUnit: 'F',
      locale: 'en-GB',
      timezone: 'America/New_York',
    });
    const after = resolveNutritionHouseholdContext(actor).activeNutritionProfile;
    expect(after).toMatchObject({
      id: before.id,
      ownerPrincipalId: before.ownerPrincipalId,
      linkedHouseholdProfileId: before.linkedHouseholdProfileId,
      profileType: before.profileType,
      displayName: 'Avery Household',
      avatarUrl: 'https://example.com/avery.png',
      version: before.version + 1,
      measurementSystem: before.measurementSystem,
      dailyResetTimezone: before.dailyResetTimezone,
      comparisonVisibility: before.comparisonVisibility,
      diaryVisibility: before.diaryVisibility,
    });
    expect(
      (
        getSqliteDatabase().prepare('SELECT COUNT(*) AS count FROM nutrition_principals').get() as {
          count: number;
        }
      ).count,
    ).toBe(1);
    expect(before.displayName).toBe('Avery');
  });
});
