import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

const cookieJar = vi.hoisted(() => new Map<string, string>());
vi.mock('server-only', () => ({}));
vi.mock('next/headers', () => ({
  cookies: async () => ({
    get: (name: string) => {
      const value = cookieJar.get(name);
      return value === undefined ? undefined : { name, value };
    },
  }),
}));

import { ACTIVE_PROFILE_COOKIE, createSignedProfileValue } from '@/lib/actor-context';
import { resetDatabaseForTests } from '@/lib/db/client';
import { addProfile, completeSetup } from '@/lib/services/household-service';
import { POST as createIdentity } from '@/app/api/v1/nutrition/identity/route';
import { GET as getSession, POST as login } from '@/app/api/v1/nutrition/session/route';
import {
  GET as listNutritionProfiles,
  POST as createNutritionProfile,
} from '@/app/api/v1/nutrition/profiles/route';
import {
  GET as getNutritionProfile,
  PATCH as updateNutritionProfile,
} from '@/app/api/v1/nutrition/profiles/[profileId]/route';
import { GET as getNutritionIntake } from '@/app/api/v1/nutrition/profiles/[profileId]/intake/route';
import { GET as getNutritionGoals } from '@/app/api/v1/nutrition/profiles/[profileId]/goals/route';
import { GET as getNutritionMeasurements } from '@/app/api/v1/nutrition/profiles/[profileId]/measurements/route';

const endpoint = 'http://localhost:3000/api/v1/nutrition';
function request(path: string, body?: unknown, trusted = true) {
  return new Request(`${endpoint}${path}`, {
    method: body === undefined ? 'GET' : 'POST',
    headers: {
      ...(trusted ? { origin: 'http://localhost:3000' } : {}),
      ...(body === undefined ? {} : { 'content-type': 'application/json' }),
    },
    body: body === undefined ? undefined : JSON.stringify(body),
  });
}

describe('Nutrition ActorContext API boundary', () => {
  beforeEach(() => {
    vi.stubEnv('DATABASE_URL', ':memory:');
    vi.stubEnv('DATA_DIR', './.test-data/nutrition-api-media');
    vi.stubEnv('COOKIE_SECRET', 'test-only-cookie-secret-that-is-at-least-32-bytes');
    cookieJar.clear();
    resetDatabaseForTests();
  });
  afterEach(() => {
    resetDatabaseForTests();
    cookieJar.clear();
    vi.unstubAllEnvs();
  });

  function setupHousehold() {
    const state = completeSetup({
      householdName: 'Test household',
      appName: 'Our Recipes',
      profile: {
        displayName: 'Avery',
        color: '#123456',
        avatarUrl: '',
        units: 'metric',
        temperatureUnit: 'C',
        locale: 'en-US',
        timezone: 'America/Los_Angeles',
      },
    });
    const second = addProfile({
      displayName: 'Riley',
      color: '#654321',
      avatarUrl: '',
      units: 'imperial',
      temperatureUnit: 'F',
      locale: 'en-US',
      timezone: 'America/New_York',
    });
    cookieJar.set(ACTIVE_PROFILE_COOKIE, createSignedProfileValue(state.profiles[0]!.id));
    return { first: state.profiles[0]!, second };
  }

  it('retires credential and session mutations while preserving trusted-origin checks', async () => {
    expect((await createIdentity(request('/identity', { secret: 'secret' }, false))).status).toBe(
      403,
    );
    expect((await createIdentity(request('/identity', { secret: 'secret' }))).status).toBe(410);
    expect((await login(request('/session', { principalId: crypto.randomUUID() }))).status).toBe(
      410,
    );
  });

  it('resolves the active signed household profile and provisions one Nutrition link each', async () => {
    setupHousehold();
    const session = await getSession();
    expect(session.status).toBe(200);
    const actor = (await session.json()).actor;
    const profilesResponse = await listNutritionProfiles();
    const profiles = (await profilesResponse.json()).profiles;
    expect(profiles).toHaveLength(2);
    expect(
      profiles.find((profile: { id: string }) => profile.id === actor.nutritionProfileId),
    ).toMatchObject({
      relationship: 'owner',
      canManageProfile: true,
    });
    expect(
      profiles.find((profile: { id: string }) => profile.id !== actor.nutritionProfileId),
    ).toMatchObject({
      relationship: 'viewer',
      canManageProfile: false,
    });
  });

  it('shares linked profile reads while keeping cross-profile settings mutations forbidden', async () => {
    setupHousehold();
    const profiles = (await (await listNutritionProfiles()).json()).profiles;
    expect(
      (await createNutritionProfile(request('/profiles', { displayName: 'Extra' }))).status,
    ).toBe(410);
    const other = profiles.find(
      (profile: { relationship: string }) => profile.relationship === 'viewer',
    );
    const response = await getNutritionProfile(new Request(`${endpoint}/profiles/${other.id}`), {
      params: Promise.resolve({ profileId: other.id }),
    });
    expect(response.status).toBe(200);
    const shared = (await response.json()).profile;
    expect(shared).toMatchObject({ id: other.id, displayName: 'Riley' });
    const mutation = await updateNutritionProfile(
      request(`/profiles/${other.id}`, {
        expectedVersion: shared.version,
        settings: { dailyResetTimezone: 'UTC' },
      }),
      { params: Promise.resolve({ profileId: other.id }) },
    );
    expect(mutation.status).toBe(403);
    const context = { params: Promise.resolve({ profileId: other.id }) };
    expect(
      (await getNutritionIntake(new Request(`${endpoint}/profiles/${other.id}/intake`), context))
        .status,
    ).toBe(200);
    expect(
      (await getNutritionGoals(new Request(`${endpoint}/profiles/${other.id}/goals`), context))
        .status,
    ).toBe(200);
    expect(
      (
        await getNutritionMeasurements(
          new Request(`${endpoint}/profiles/${other.id}/measurements`),
          context,
        )
      ).status,
    ).toBe(200);
  });

  it('accepts only active-profile Nutrition settings and rejects identity or visibility fields', async () => {
    setupHousehold();
    const profiles = (await (await listNutritionProfiles()).json()).profiles;
    const own = profiles.find(
      (profile: { relationship: string }) => profile.relationship === 'owner',
    );
    const context = { params: Promise.resolve({ profileId: own.id }) };
    for (const settings of [
      { displayName: 'Browser override' },
      { linkedHouseholdProfileId: crypto.randomUUID() },
      { profileType: 'guest' },
      { comparisonVisibility: 'hidden' },
      { diaryVisibility: 'private' },
    ]) {
      expect(
        (
          await updateNutritionProfile(
            request(`/profiles/${own.id}`, { expectedVersion: own.version, settings }),
            context,
          )
        ).status,
      ).toBe(400);
    }
    const updated = await updateNutritionProfile(
      request(`/profiles/${own.id}`, {
        expectedVersion: own.version,
        settings: { dailyResetTimezone: 'America/Denver' },
      }),
      context,
    );
    expect(updated.status).toBe(200);
    expect((await updated.json()).profile).toMatchObject({
      displayName: 'Avery',
      dailyResetTimezone: 'America/Denver',
      version: own.version + 1,
    });
  });
});
