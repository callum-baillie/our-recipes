import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

const cookieJar = vi.hoisted(() => new Map<string, string>());
vi.mock('server-only', () => ({}));
vi.mock('next/headers', () => ({
  cookies: async () => ({
    get: (name: string) => (cookieJar.has(name) ? { value: cookieJar.get(name) } : undefined),
  }),
}));

import { POST as commandRoute } from '@/app/api/v1/nutrition/profiles/[profileId]/diary-commands/route';
import { DELETE as deleteDataRoute } from '@/app/api/v1/nutrition/profiles/[profileId]/data/route';
import { GET as exportRoute } from '@/app/api/v1/nutrition/profiles/[profileId]/export/route';
import { ACTIVE_PROFILE_COOKIE, createSignedProfileValue } from '@/lib/actor-context';
import { resetDatabaseForTests } from '@/lib/db/client';
import { appendNutritionIntakeRevision } from '@/lib/services/nutrition-intake-service';
import { createNutritionDataSource } from '@/lib/services/nutrition-foundation-service';
import { completeSetup } from '@/lib/services/household-service';
import { resolveNutritionHouseholdContext } from '@/lib/services/nutrition-household-profile-service';

describe('Nutrition diary lifecycle ActorContext APIs', () => {
  let profileId: string;
  let revisionId: string;

  beforeEach(() => {
    vi.stubEnv('DATABASE_URL', ':memory:');
    vi.stubEnv('DATA_DIR', './.test-data/nutrition-diary-api');
    vi.stubEnv('COOKIE_SECRET', 'diary-api-cookie-secret-that-is-at-least-32-bytes');
    cookieJar.clear();
    resetDatabaseForTests();
    const state = completeSetup({
      householdName: 'Household',
      appName: 'Our Recipes',
      profile: {
        displayName: 'API diner',
        color: '#123456',
        avatarUrl: '',
        units: 'metric',
        temperatureUnit: 'C',
        locale: 'en-US',
        timezone: 'UTC',
      },
    });
    const householdId = state.profiles[0]!.id;
    cookieJar.set(ACTIVE_PROFILE_COOKIE, createSignedProfileValue(householdId));
    const context = resolveNutritionHouseholdContext({
      profileId: householdId,
      source: 'profile-cookie',
    });
    profileId = context.activeNutritionProfile.id;
    const source = createNutritionDataSource({
      sourceType: 'manual',
      name: 'API evidence',
      provider: 'Our Recipes',
      version: '1',
      citation: 'API test',
    });
    revisionId = appendNutritionIntakeRevision(profileId, context.compatibilityPrincipalId, {
      occurredAt: '2026-07-19T12:00:00Z',
      mealSlot: 'lunch',
      state: 'eaten',
      sourceType: 'manual',
      sourceNameSnapshot: 'API meal',
      quantity: 1,
      unit: 'portion',
      provenance: {
        sourceIds: [source.id],
        sourceDetails: [
          {
            id: source.id,
            name: source.name,
            provider: source.provider,
            version: source.version,
            sourceRecordKey: '',
          },
        ],
        calculationVersionId: null,
        sourceDigest: 'api-manual-v1',
        basisType: 'manual_portion',
        basisAmount: 1,
        basisUnit: 'portion',
        confidence: 1,
        completeness: 1,
        estimated: false,
      },
      values: [
        {
          nutrientCode: 'energy_kcal',
          amount: 100,
          sourceIds: [source.id],
          confidence: 1,
          completeness: 1,
          estimated: false,
        },
      ],
    }).id;
  });
  afterEach(() => {
    resetDatabaseForTests();
    cookieJar.clear();
    vi.unstubAllEnvs();
  });

  it('preserves trusted-origin validation and rejects client-owned snapshots', async () => {
    const path = `/api/v1/nutrition/profiles/${profileId}/diary-commands`;
    const untrusted = new Request(`http://localhost:3000${path}`, {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: '{}',
    });
    expect((await commandRoute(untrusted, { params: Promise.resolve({ profileId }) })).status).toBe(
      403,
    );
    const supplied = new Request(`http://localhost:3000${path}`, {
      method: 'POST',
      headers: { 'content-type': 'application/json', origin: 'http://localhost:3000' },
      body: JSON.stringify({
        command: 'copy_entry',
        sourceRevisionId: revisionId,
        occurredAt: '2026-07-20T12:00:00Z',
        mealSlot: 'lunch',
        idempotencyKey: 'api-copy-entry-0001',
        values: [{ nutrientCode: 'energy_kcal', amount: 9999 }],
      }),
    });
    expect((await commandRoute(supplied, { params: Promise.resolve({ profileId }) })).status).toBe(
      400,
    );
  });

  it('exports only the active linked profile with private response headers', async () => {
    const response = await exportRoute(
      new Request(`http://localhost:3000/api/v1/nutrition/profiles/${profileId}/export`),
      { params: Promise.resolve({ profileId }) },
    );
    expect(response.status).toBe(200);
    expect(response.headers.get('cache-control')).toContain('private, no-store');
    expect(response.headers.get('x-content-type-options')).toBe('nosniff');
  });

  it('retires independent Nutrition-profile deletion after trusted-origin validation', async () => {
    const path = `/api/v1/nutrition/profiles/${profileId}/data`;
    const untrusted = new Request(`http://localhost:3000${path}`, {
      method: 'DELETE',
      headers: { 'content-type': 'application/json' },
      body: '{}',
    });
    expect(
      (await deleteDataRoute(untrusted, { params: Promise.resolve({ profileId }) })).status,
    ).toBe(403);
    const trusted = new Request(`http://localhost:3000${path}`, {
      method: 'DELETE',
      headers: { 'content-type': 'application/json', origin: 'http://localhost:3000' },
      body: '{}',
    });
    expect(
      (await deleteDataRoute(trusted, { params: Promise.resolve({ profileId }) })).status,
    ).toBe(410);
  });
});
