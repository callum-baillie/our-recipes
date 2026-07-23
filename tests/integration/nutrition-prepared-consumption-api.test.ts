import { beforeEach, describe, expect, it, vi } from 'vitest';

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

import { POST as consumePrepared } from '@/app/api/v1/nutrition/profiles/[profileId]/prepared-recipes/[preparedId]/consume/route';
import { POST as recordPreparedState } from '@/app/api/v1/nutrition/profiles/[profileId]/prepared-recipes/[preparedId]/allocations/route';
import { POST as createPrepared } from '@/app/api/v1/nutrition/profiles/[profileId]/prepared-recipes/route';
import { ACTIVE_PROFILE_COOKIE, createSignedProfileValue } from '@/lib/actor-context';
import { getDatabase, resetDatabaseForTests } from '@/lib/db/client';
import { cookSessions, mealPlanEntries, recipes } from '@/lib/db/schema';
import { completeSetup } from '@/lib/services/household-service';
import {
  appendRecipeNutritionCalculation,
  createNutritionDataSource,
  registerCalculationVersion,
} from '@/lib/services/nutrition-foundation-service';
import { createNutritionIdentity } from './nutrition-household-fixture';

function request(path: string, body: unknown, trusted = true) {
  return new Request(`http://localhost:3000${path}`, {
    method: 'POST',
    headers: {
      'content-type': 'application/json',
      ...(trusted ? { origin: 'http://localhost:3000' } : {}),
    },
    body: JSON.stringify(body),
  });
}

describe('prepared consumption APIs', () => {
  let profileId: string;
  let calculationId: string;
  let mealPlanEntryId: string;
  let cookSessionId: string;

  beforeEach(() => {
    vi.stubEnv('DATABASE_URL', ':memory:');
    vi.stubEnv('DATA_DIR', './.test-data/nutrition-prepared-api');
    vi.stubEnv('COOKIE_SECRET', 'prepared-api-cookie-secret-that-is-at-least-32-bytes');
    cookieJar.clear();
    resetDatabaseForTests();
    const householdProfileId = completeSetup({
      householdName: 'Prepared API household',
      appName: 'Our Recipes',
      profile: {
        displayName: 'API cook',
        color: '#245b78',
        avatarUrl: '',
        units: 'metric',
        temperatureUnit: 'C',
        locale: 'en-US',
        timezone: 'America/Los_Angeles',
      },
    }).profiles[0]!.id;
    const identity = createNutritionIdentity('prepared API owner secret', {
      displayName: 'API diner',
      linkedHouseholdProfileId: householdProfileId,
      dailyResetTimezone: 'America/Los_Angeles',
    });
    profileId = identity.profile.id;
    cookieJar.set(ACTIVE_PROFILE_COOKIE, createSignedProfileValue(householdProfileId));

    const recipeId = crypto.randomUUID();
    mealPlanEntryId = crypto.randomUUID();
    cookSessionId = crypto.randomUUID();
    const now = new Date('2026-07-19T18:00:00Z');
    getDatabase()
      .insert(recipes)
      .values({
        id: recipeId,
        title: 'API soup',
        summary: '',
        status: 'active',
        servings: '4 servings',
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
    getDatabase()
      .insert(mealPlanEntries)
      .values({
        id: mealPlanEntryId,
        plannedFor: '2026-07-19',
        meal: 'dinner',
        recipeId,
        title: '',
        servings: 4,
        note: '',
        createdByProfileId: householdProfileId,
        updatedByProfileId: householdProfileId,
        createdAt: now,
        updatedAt: now,
      })
      .run();
    getDatabase()
      .insert(cookSessions)
      .values({
        id: cookSessionId,
        recipeId,
        profileId: householdProfileId,
        targetServings: 4,
        mealPlanEntryId,
        startedAt: now,
        completedAt: now,
      })
      .run();
    const source = createNutritionDataSource({
      sourceType: 'calculated',
      name: 'API calculation source',
      provider: 'Our Recipes',
      version: '1',
      citation: 'API test',
    });
    const version = registerCalculationVersion({
      algorithm: 'ingredient-sum',
      version: '1',
      energyFactorsVersion: 'general-4-4-9-7-v1',
      implementationDigest: 'prepared-api-v1',
    });
    calculationId = appendRecipeNutritionCalculation({
      recipeId,
      recipeRevision: 1,
      calculationVersionId: version.id,
      sourceId: source.id,
      sourceDigest: 'prepared-api-calculation-v1',
      servingCount: 4,
      confidence: 0.9,
      completeness: 0.8,
      values: [{ nutrientCode: 'energy_kcal', amount: 800, confidence: 0.9, completeness: 0.8 }],
    }).id;
  });

  it('requires trusted origins and rejects browser-supplied nutrient snapshots', async () => {
    const path = `/api/v1/nutrition/profiles/${profileId}/prepared-recipes`;
    expect(
      (await createPrepared(request(path, {}, false), { params: Promise.resolve({ profileId }) }))
        .status,
    ).toBe(403);
    expect(
      (
        await createPrepared(
          request(path, {
            preparedInstanceId: crypto.randomUUID(),
            recipeCalculationId: calculationId,
            mealPlanEntryId,
            cookSessionId,
            actualServings: 4,
            preparationMatchesCalculation: true,
            values: [{ nutrientCode: 'energy_kcal', amount: 9999 }],
          }),
          { params: Promise.resolve({ profileId }) },
        )
      ).status,
    ).toBe(400);
  });

  it('creates once and returns the same atomic pair on route retry', async () => {
    const preparedId = crypto.randomUUID();
    const createPath = `/api/v1/nutrition/profiles/${profileId}/prepared-recipes`;
    const created = await createPrepared(
      request(createPath, {
        preparedInstanceId: preparedId,
        recipeCalculationId: calculationId,
        mealPlanEntryId,
        cookSessionId,
        actualServings: 4,
        preparationMatchesCalculation: true,
      }),
      { params: Promise.resolve({ profileId }) },
    );
    expect(created.status).toBe(201);

    const consumePath = `${createPath}/${preparedId}/consume`;
    const body = {
      idempotencyKey: 'prepared-api-command-001',
      servingCount: 0.5,
      occurredAt: '2026-07-19T20:00:00-07:00',
      mealSlot: 'dinner',
    };
    const first = await consumePrepared(request(consumePath, body), {
      params: Promise.resolve({ profileId, preparedId }),
    });
    const replay = await consumePrepared(request(consumePath, body), {
      params: Promise.resolve({ profileId, preparedId }),
    });
    expect(first.status).toBe(201);
    expect(replay.status).toBe(200);
    const firstBody = await first.json();
    const replayBody = await replay.json();
    expect(replayBody).toMatchObject({
      replayed: true,
      intake: { id: firstBody.intake.id },
      allocation: { id: firstBody.allocation.id },
    });
  });

  it('records non-eaten state idempotently without creating intake', async () => {
    const preparedId = crypto.randomUUID();
    const createPath = `/api/v1/nutrition/profiles/${profileId}/prepared-recipes`;
    await createPrepared(
      request(createPath, {
        preparedInstanceId: preparedId,
        recipeCalculationId: calculationId,
        mealPlanEntryId,
        cookSessionId,
        actualServings: 4,
        preparationMatchesCalculation: true,
      }),
      { params: Promise.resolve({ profileId }) },
    );
    const path = `${createPath}/${preparedId}/allocations`;
    const body = {
      allocationSeriesId: crypto.randomUUID(),
      state: 'leftover',
      servingCount: 1.25,
      note: 'For tomorrow',
    };
    const first = await recordPreparedState(request(path, body), {
      params: Promise.resolve({ profileId, preparedId }),
    });
    const replay = await recordPreparedState(request(path, body), {
      params: Promise.resolve({ profileId, preparedId }),
    });
    expect(first.status).toBe(201);
    expect(replay.status).toBe(200);
    expect(await replay.json()).toMatchObject({
      replayed: true,
      allocation: { state: 'leftover', servings: 1.25 },
    });
  });
});
