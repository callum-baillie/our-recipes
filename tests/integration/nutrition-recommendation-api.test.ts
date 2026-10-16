import { beforeEach, describe, expect, it, vi } from 'vitest';

const cookieJar = vi.hoisted(() => new Map<string, string>());
const listRecommendations = vi.hoisted(() => vi.fn());
const appendFeedback = vi.hoisted(() => vi.fn());
vi.mock('server-only', () => ({}));
vi.mock('next/headers', () => ({
  cookies: async () => ({
    get: (name: string) => {
      const value = cookieJar.get(name);
      return value === undefined ? undefined : { name, value };
    },
  }),
}));
vi.mock('@/lib/services/nutrition-recommendation-service', () => ({
  NutritionRecommendationNotFoundError: class extends Error {},
  NutritionRecommendationConflictError: class extends Error {},
  appendNutritionRecommendationFeedback: appendFeedback,
  getNutritionRecommendations: listRecommendations,
}));

import { GET } from '@/app/api/v1/nutrition/profiles/[profileId]/recommendations/route';
import { POST } from '@/app/api/v1/nutrition/profiles/[profileId]/recommendations/[recommendationKey]/feedback/route';
import { ACTIVE_PROFILE_COOKIE, createSignedProfileValue } from '@/lib/actor-context';
import { resetDatabaseForTests } from '@/lib/db/client';
import { completeSetup } from '@/lib/services/household-service';
import { resolveNutritionHouseholdContext } from '@/lib/services/nutrition-household-profile-service';

describe('Nutrition recommendation feedback API', () => {
  beforeEach(() => {
    vi.stubEnv('DATABASE_URL', ':memory:');
    vi.stubEnv('DATA_DIR', './.test-data/nutrition-recommendation-api');
    vi.stubEnv('COOKIE_SECRET', 'recommendation-api-secret-that-is-at-least-32-bytes');
    cookieJar.clear();
    appendFeedback.mockReset();
    listRecommendations.mockReset();
    resetDatabaseForTests();
  });

  it('requires trusted signed requests and passes only strict feedback to the service', async () => {
    const household = completeSetup({
      householdName: 'Household',
      appName: 'Our Recipes',
      profile: {
        displayName: 'API diner',
        color: '#245b78',
        avatarUrl: '',
        units: 'metric',
        temperatureUnit: 'C',
        locale: 'en-US',
        timezone: 'America/Los_Angeles',
      },
    });
    const householdProfileId = household.profiles[0]!.id;
    const nutrition = resolveNutritionHouseholdContext({
      profileId: householdProfileId,
      source: 'profile-cookie',
    });
    const key = 'a'.repeat(64);
    const path = `/api/v1/nutrition/profiles/${nutrition.activeNutritionProfile.id}/recommendations/${key}/feedback`;
    const context = {
      params: Promise.resolve({
        profileId: nutrition.activeNutritionProfile.id,
        recommendationKey: key,
      }),
    };
    const untrusted = await POST(
      new Request(`http://localhost:3000${path}`, {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({ state: 'helpful' }),
      }),
      context,
    );
    expect(untrusted.status).toBe(403);
    expect(appendFeedback).not.toHaveBeenCalled();

    cookieJar.set(ACTIVE_PROFILE_COOKIE, createSignedProfileValue(householdProfileId));
    appendFeedback.mockReturnValue({ id: 'feedback', state: 'helpful' });
    listRecommendations.mockReturnValue([{ key: 'suggestion', recipeTitle: 'Soup' }]);
    const listed = await GET(
      new Request(
        `http://localhost:3000/api/v1/nutrition/profiles/${nutrition.activeNutritionProfile.id}/recommendations`,
      ),
      { params: Promise.resolve({ profileId: nutrition.activeNutritionProfile.id }) },
    );
    expect(listed.status).toBe(200);
    expect(listed.headers.get('cache-control')).toBe('no-store');
    expect(listRecommendations).toHaveBeenCalledWith(
      nutrition.activeNutritionProfile.id,
      nutrition.compatibilityPrincipalId,
    );
    expect(await listed.json()).toEqual({
      recommendations: [{ key: 'suggestion', recipeTitle: 'Soup' }],
    });
    const invalidProfile = await GET(
      new Request('http://localhost:3000/api/v1/nutrition/profiles/invalid/recommendations'),
      { params: Promise.resolve({ profileId: 'invalid' }) },
    );
    expect(invalidProfile.status).toBe(400);

    const response = await POST(
      new Request(`http://localhost:3000${path}`, {
        method: 'POST',
        headers: { 'content-type': 'application/json', origin: 'http://localhost:3000' },
        body: JSON.stringify({ state: 'helpful' }),
      }),
      context,
    );
    expect(response.status).toBe(201);
    expect(appendFeedback).toHaveBeenCalledWith(
      nutrition.activeNutritionProfile.id,
      {
        householdProfileId,
        compatibilityPrincipalId: nutrition.compatibilityPrincipalId,
      },
      key,
      {
        state: 'helpful',
        reason: '',
        supersedesFeedbackId: null,
      },
    );

    const invalid = await POST(
      new Request(`http://localhost:3000${path}`, {
        method: 'POST',
        headers: { 'content-type': 'application/json', origin: 'http://localhost:3000' },
        body: JSON.stringify({ state: 'helpful', nutrientAmount: 999 }),
      }),
      context,
    );
    expect(invalid.status).toBe(400);
  });
});
