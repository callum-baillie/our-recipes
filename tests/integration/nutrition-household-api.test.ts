import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

const cookieJar = vi.hoisted(() => new Map<string, string>());
vi.mock('server-only', () => ({}));
vi.mock('next/headers', () => ({
  cookies: async () => ({
    get: (name: string) => (cookieJar.has(name) ? { value: cookieJar.get(name) } : undefined),
  }),
}));

import { ACTIVE_PROFILE_COOKIE, createSignedProfileValue } from '@/lib/actor-context';
import { resetDatabaseForTests } from '@/lib/db/client';
import { completeSetup } from '@/lib/services/household-service';
import { GET } from '@/app/api/v1/nutrition/household/route';

describe('Nutrition household API', () => {
  beforeEach(() => {
    vi.stubEnv('DATABASE_URL', ':memory:');
    vi.stubEnv('COOKIE_SECRET', 'test-only-cookie-secret-that-is-at-least-32-bytes');
    resetDatabaseForTests();
    cookieJar.clear();
  });
  afterEach(() => {
    resetDatabaseForTests();
    vi.unstubAllEnvs();
  });

  it('uses the active household profile and returns bounded shared summaries', async () => {
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
    cookieJar.set(ACTIVE_PROFILE_COOKIE, createSignedProfileValue(state.profiles[0]!.id));
    const response = await GET();
    expect(response.status).toBe(200);
    const comparison = (await response.json()).comparison;
    expect(comparison.range).toEqual(
      expect.objectContaining({ start: expect.any(String), end: expect.any(String) }),
    );
    expect(comparison.members[0]).toMatchObject({
      label: 'Avery',
      confirmedCount: 0,
      averageCompleteness: null,
    });
    expect(JSON.stringify(comparison)).not.toContain('ownerPrincipalId');
  });
});
