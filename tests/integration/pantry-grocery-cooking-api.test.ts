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

import { POST as completeCook } from '@/app/api/v1/cook-sessions/[sessionId]/complete/route';
import { POST as previewCookPantry } from '@/app/api/v1/cook-sessions/[sessionId]/pantry/route';
import { POST as generateShortages } from '@/app/api/v1/shopping-lists/pantry-shortages/route';
import { POST as intakePurchase } from '@/app/api/v1/shopping-lists/[listId]/items/[itemId]/pantry-intake/route';
import { PATCH as updatePantryControl } from '@/app/api/v1/shopping-lists/[listId]/items/[itemId]/pantry-controls/route';
import { ACTIVE_PROFILE_COOKIE, createSignedProfileValue } from '@/lib/actor-context';
import { resetDatabaseForTests } from '@/lib/db/client';
import { completeSetup } from '@/lib/services/household-service';

const endpoint = 'http://localhost:3000/api/v1';
function request(path: string, body: unknown, trusted = true, method = 'POST') {
  return new Request(`${endpoint}${path}`, {
    method,
    headers: {
      ...(trusted ? { origin: 'http://localhost:3000' } : {}),
      'content-type': 'application/json',
    },
    body: JSON.stringify(body),
  });
}

describe('Pantry grocery and cooking API boundary', () => {
  beforeEach(() => {
    vi.stubEnv('DATABASE_URL', ':memory:');
    vi.stubEnv('DATA_DIR', './.test-data/pantry-grocery-cooking-api');
    vi.stubEnv('COOKIE_SECRET', 'test-only-cookie-secret-that-is-at-least-32-bytes');
    cookieJar.clear();
    resetDatabaseForTests();
    const profileId = completeSetup({
      householdName: 'Pantry household',
      appName: 'Our Recipes',
      profile: {
        displayName: 'Maya',
        color: '#637A45',
        avatarUrl: '',
        units: 'metric',
        temperatureUnit: 'C',
        locale: 'en-GB',
        timezone: 'Europe/London',
      },
    }).profiles[0]!.id;
    cookieJar.set(ACTIVE_PROFILE_COOKIE, createSignedProfileValue(profileId));
  });

  afterEach(() => {
    resetDatabaseForTests();
    cookieJar.clear();
    vi.unstubAllEnvs();
  });

  it('preserves exact trusted-origin checks on shortage generation', async () => {
    const body = { weekStart: '2027-04-01', weekEnd: '2027-04-07' };
    expect(
      (await generateShortages(request('/shopping-lists/pantry-shortages', body, false))).status,
    ).toBe(403);
    expect(
      (await generateShortages(request('/shopping-lists/pantry-shortages', body))).status,
    ).toBe(201);
  });

  it('requires explicit Pantry confirmation before cook completion', async () => {
    const response = await completeCook(
      request('/cook-sessions/00000000-0000-4000-8000-000000000999/complete', {}),
      { params: Promise.resolve({ sessionId: '00000000-0000-4000-8000-000000000999' }) },
    );
    expect(response.status).toBe(400);
    expect(await response.json()).toMatchObject({
      error: { code: 'explicit_pantry_confirmation_required' },
    });
  });

  it('validates adjusted FEFO previews behind the trusted-origin boundary', async () => {
    const context = {
      params: Promise.resolve({ sessionId: '00000000-0000-4000-8000-000000000999' }),
    };
    const body = { productId: '00000000-0000-4000-8000-000000000001', quantity: 1, unit: 'g' };
    expect(
      (await previewCookPantry(request('/cook-sessions/x/pantry', body, false), context)).status,
    ).toBe(403);
    expect(
      (
        await previewCookPantry(
          request('/cook-sessions/x/pantry', { ...body, quantity: 0 }),
          context,
        )
      ).status,
    ).toBe(400);
  });

  it('requires an explicit purchase intake operation key at the API boundary', async () => {
    const response = await intakePurchase(
      request('/shopping-lists/list/items/item/pantry-intake', {
        idempotencyKey: 'legacy-derived-key',
        productId: '00000000-0000-4000-8000-000000000001',
        locationId: '00000000-0000-4000-8000-000000000002',
        quantity: 2,
        unit: 'each',
      }),
      { params: Promise.resolve({ listId: 'list', itemId: 'item' }) },
    );
    expect(response.status).toBe(400);
    expect(await response.json()).toMatchObject({ error: { code: 'invalid_pantry_intake' } });
  });

  it('validates Pantry controls behind the same trusted-origin and actor boundary', async () => {
    const context = { params: Promise.resolve({ listId: 'list', itemId: 'item' }) };
    expect(
      (
        await updatePantryControl(
          request(
            '/shopping-lists/list/items/item/pantry-controls',
            { action: 'reset' },
            false,
            'PATCH',
          ),
          context,
        )
      ).status,
    ).toBe(403);
    const invalid = await updatePantryControl(
      request(
        '/shopping-lists/list/items/item/pantry-controls',
        { action: 'extra' },
        true,
        'PATCH',
      ),
      context,
    );
    expect(invalid.status).toBe(400);
    expect(await invalid.json()).toMatchObject({ error: { code: 'invalid_pantry_control' } });
  });
});
