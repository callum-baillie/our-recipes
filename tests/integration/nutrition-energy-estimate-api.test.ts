import { beforeEach, describe, expect, it, vi } from 'vitest';

const cookieJar = vi.hoisted(() => new Map<string, string>());
const estimate = vi.hoisted(() => vi.fn());
vi.mock('server-only', () => ({}));
vi.mock('next/headers', () => ({
  cookies: async () => ({
    get: (name: string) => {
      const value = cookieJar.get(name);
      return value === undefined ? undefined : { name, value };
    },
  }),
}));
vi.mock('@/lib/services/nutrition-energy-estimate-service', () => ({
  previewOrApplyNutritionEnergyEstimate: estimate,
}));

import { POST } from '@/app/api/v1/nutrition/profiles/[profileId]/goals/estimate/route';
import { ACTIVE_PROFILE_COOKIE, createSignedProfileValue } from '@/lib/actor-context';
import { resetDatabaseForTests } from '@/lib/db/client';
import { completeSetup } from '@/lib/services/household-service';
import { resolveNutritionHouseholdContext } from '@/lib/services/nutrition-household-profile-service';

describe('Nutrition energy estimate API', () => {
  beforeEach(() => {
    vi.stubEnv('DATABASE_URL', ':memory:');
    vi.stubEnv('DATA_DIR', './.test-data/nutrition-energy-estimate-api');
    vi.stubEnv('COOKIE_SECRET', 'energy-estimate-api-secret-at-least-32-bytes');
    cookieJar.clear();
    estimate.mockReset();
    resetDatabaseForTests();
  });

  it('requires trusted strict signed requests and passes no body measurements from the client', async () => {
    const household = completeSetup({
      householdName: 'Household',
      appName: 'Our Recipes',
      profile: {
        displayName: 'Energy API',
        color: '#245b78',
        avatarUrl: '',
        units: 'metric',
        temperatureUnit: 'C',
        locale: 'en-US',
        timezone: 'UTC',
      },
    });
    const householdProfileId = household.profiles[0]!.id;
    const nutrition = resolveNutritionHouseholdContext({
      profileId: householdProfileId,
      source: 'profile-cookie',
    });
    const path = `/api/v1/nutrition/profiles/${nutrition.activeNutritionProfile.id}/goals/estimate`;
    const context = {
      params: Promise.resolve({ profileId: nutrition.activeNutritionProfile.id }),
    };
    const body = {
      action: 'preview',
      expectedProfileVersion: 1,
      effectiveOn: '2026-07-19',
      palCategory: 'active',
    };
    const untrusted = await POST(
      new Request(`http://localhost:3000${path}`, {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify(body),
      }),
      context,
    );
    expect(untrusted.status).toBe(403);
    cookieJar.set(ACTIVE_PROFILE_COOKIE, createSignedProfileValue(householdProfileId));
    estimate.mockReturnValue({
      action: 'previewed',
      estimate: {},
      currentEnergyGoals: [],
      goal: null,
    });
    const response = await POST(
      new Request(`http://localhost:3000${path}`, {
        method: 'POST',
        headers: { 'content-type': 'application/json', origin: 'http://localhost:3000' },
        body: JSON.stringify(body),
      }),
      context,
    );
    expect(response.status).toBe(200);
    expect(estimate).toHaveBeenCalledWith(
      nutrition.activeNutritionProfile.id,
      {
        householdProfileId,
        compatibilityPrincipalId: nutrition.compatibilityPrincipalId,
      },
      body,
    );
    const invalid = await POST(
      new Request(`http://localhost:3000${path}`, {
        method: 'POST',
        headers: { 'content-type': 'application/json', origin: 'http://localhost:3000' },
        body: JSON.stringify({ ...body, weightKilograms: 50 }),
      }),
      context,
    );
    expect(invalid.status).toBe(400);
  });
});
