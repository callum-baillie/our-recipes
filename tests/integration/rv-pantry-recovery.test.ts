import { afterAll, afterEach, beforeAll, describe, expect, it, vi } from 'vitest';
import { randomUUID } from 'node:crypto';
import { eq } from 'drizzle-orm';
import { POST as createBatch } from '@/app/api/v1/pantry/batches/route';
import { POST as recoverBatch } from '@/app/api/v1/food-data/confirmations/recovery/route';
import { POST as importCatalogBatch } from '@/app/api/v1/pantry/catalog-imports/route';
import { POST as confirmShopping } from '@/app/api/v1/shopping-lists/[listId]/catalog-items/route';
import { prepareIdempotentMutation } from '@/lib/api-idempotency';
import {
  apiIdempotencyRecords,
  pantryBatches,
  session,
  shoppingLists,
  shoppingListItems,
} from '@/lib/db/schema';
import { getDatabase, resetDatabaseForTests } from '@/lib/db/client';
import { pantryProductInputSchema, pantryLocationInputSchema } from '@/lib/domain/pantry';
import { createPantryProduct, createPantryLocation } from '@/lib/services/pantry-service';
import { getFoodDetails } from '@/lib/services/food-data-service';
import { clearCatalogStateForTests } from '@/lib/services/bord-catalog-service';
import {
  importFoodCatalogRecord,
  confirmCatalogShoppingItem,
} from '@/lib/services/food-catalog-import-service';
import { createManualShoppingList, addShoppingListItem } from '@/lib/services/planning-service';
import { catalogConfirmation } from '../../shared/mobile-domain/catalog';
import { foodCatalogImportInputSchema } from '@/lib/domain/food-data';
import { startCatalogFixture } from '../fixtures/bord-catalog-server';

const origin = 'http://localhost:3000';
let cookie: string;
let actor: { userId: string; profileId: string };
let command: Record<string, unknown>;
let authentication: typeof import('@/lib/services/auth-service');
let fixture: Awaited<ReturnType<typeof startCatalogFixture>>;
let reviewed: Awaited<ReturnType<typeof getFoodDetails>>['record'];
const realFetch = globalThis.fetch;
const boundedFetch = (input: string | URL | Request, init?: RequestInit) => {
  const url = new URL(input instanceof Request ? input.url : String(input));
  if (url.origin !== fixture.baseUrl) throw new Error('External egress denied by fixture');
  return realFetch(input, init);
};
function request(path: string, body: unknown, operationId?: string, credentials = true) {
  return new Request(`${origin}/api/v1${path}`, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      ...(credentials ? { cookie, origin } : {}),
      ...(operationId
        ? { 'Idempotency-Key': operationId, 'X-Bord-Expected-Profile-Id': actor.profileId }
        : {}),
    },
    body: JSON.stringify(body),
  });
}
const recover = (
  operationId: string,
  action: 'inspect' | 'abandon',
  overrides: Record<string, unknown> = {},
) =>
  recoverBatch(
    request('/food-data/confirmations/recovery', {
      operationId,
      commandPath: '/api/v1/pantry/batches',
      actor,
      command,
      action,
      ...overrides,
    }),
  );
beforeAll(async () => {
  fixture = await startCatalogFixture();
  vi.stubEnv('DATABASE_URL', ':memory:');
  vi.stubEnv('DATA_DIR', './.test-data/rv-pantry-recovery');
  vi.stubEnv('BETTER_AUTH_URL', origin);
  vi.stubEnv('APP_ORIGIN', origin);
  vi.stubEnv('COOKIE_SECRET', 'fixture-cookie-secret-for-rv-pantry-recovery');
  vi.stubEnv('BETTER_AUTH_SECRET', 'fixture-auth-secret-for-rv-pantry-recovery');
  vi.stubEnv('AUTH_REQUIRE_EMAIL_VERIFICATION', 'false');
  vi.stubEnv('BORD_FOOD_API_BASE_URL', fixture.baseUrl);
  vi.stubEnv('BORD_FOOD_API_KEY', 'synthetic-read-key');
  vi.stubEnv('FOOD_DATA_MODE', 'catalog_only');
  vi.stubEnv('FOOD_DATA_ALLOW_REMOTE_FALLBACK', 'false');
  clearCatalogStateForTests();
  const { auth } = await import('@/lib/auth/server');
  authentication = await import('@/lib/services/auth-service');
  const enrollment = await authentication.prepareProfileEnrollment(
    'Fixture reviewer',
    { email: 'rv-pantry@example.test', passphrase: 'synthetic pantry review passphrase' },
    'admin',
  );
  const { completeSetupWithResult } = await import('@/lib/services/household-service');
  const setup = completeSetupWithResult(
    {
      kitchenName: 'Recovery fixture',
      profile: {
        displayName: 'Fixture reviewer',
        color: '#637A45',
        avatarUrl: '',
        units: 'metric',
        temperatureUnit: 'C',
        locale: 'en-GB',
        timezone: 'Europe/London',
      },
    },
    [enrollment],
  );
  actor = { userId: enrollment.user.id, profileId: setup.state.profiles[0]!.id };
  const response = await auth.api.signInEmail({
    body: { email: 'rv-pantry@example.test', password: 'synthetic pantry review passphrase' },
    headers: new Headers({ origin }),
    asResponse: true,
  });
  cookie = response.headers
    .getSetCookie()
    .map((value) => value.split(';')[0])
    .join('; ');
  const product = createPantryProduct(
    pantryProductInputSchema.parse({ displayName: 'Local oats', defaultInventoryUnit: 'g' }),
    actor.profileId,
  );
  const location = createPantryLocation(
    pantryLocationInputSchema.parse({ name: 'Fixture cupboard', storageType: 'pantry' }),
    actor.profileId,
  );
  command = {
    productId: product.id,
    locationId: location.id,
    quantityRemaining: 500,
    originalQuantity: 500,
    unit: 'g',
    status: 'unopened',
    expiryPrecision: 'unknown',
    source: 'Reviewed barcode',
    notes: '',
  };
  vi.stubGlobal('fetch', boundedFetch);
  reviewed = (await getFoodDetails('usda_fdc', '123', 'en')).record;
});
afterEach(() => {
  fixture.state.missingFood = false;
  fixture.state.revision = 'revision_1';
  fixture.state.unavailable = false;
  clearCatalogStateForTests();
  vi.stubGlobal('fetch', boundedFetch);
});
afterAll(async () => {
  resetDatabaseForTests();
  clearCatalogStateForTests();
  vi.unstubAllGlobals();
  vi.unstubAllEnvs();
  await fixture.close();
});
describe('durable local Pantry confirmation and recovery through authenticated handlers', () => {
  it('retains an expired historical receipt through unrelated cleanup and replays after more than 24 hours without another batch', async () => {
    const operationId = randomUUID();
    const response = await createBatch(request('/pantry/batches', command, operationId));
    expect(response.status).toBe(201);
    const saved = await response.json();
    const receipt = getDatabase().select().from(apiIdempotencyRecords).get()!;
    getDatabase()
      .update(apiIdempotencyRecords)
      .set({
        expiresAt: new Date(Date.now() - 72 * 3600_000),
        createdAt: new Date(Date.now() - 96 * 3600_000),
      })
      .where(eq(apiIdempotencyRecords.id, receipt.id))
      .run();
    const principal = await authentication.requireAdminSession(request('/collections', {}));
    await prepareIdempotentMutation(
      request('/collections', { name: 'Cleanup probe' }, randomUUID()),
      principal,
      'cleanup-probe',
    );
    expect(
      getDatabase()
        .select()
        .from(apiIdempotencyRecords)
        .where(eq(apiIdempotencyRecords.id, receipt.id))
        .get(),
    ).toBeTruthy();
    const inspection = await recover(operationId, 'inspect');
    expect(inspection.status).toBe(200);
    expect(await inspection.json()).toMatchObject({ status: 'acknowledged', result: saved });
    const replay = await createBatch(request('/pantry/batches', command, operationId));
    expect(replay.status).toBe(201);
    expect(replay.headers.get('Idempotency-Replayed')).toBe('true');
    expect(await replay.json()).toEqual(saved);
    expect(getDatabase().select().from(pantryBatches).all()).toHaveLength(1);
    expect(
      (await recover(operationId, 'inspect', { command: { ...command, quantityRemaining: 400 } }))
        .status,
    ).toBe(409);
  });
  it('binds receipt access to current account, original profile, strict intent and trusted origin', async () => {
    const operationId = randomUUID();
    expect(
      (await recover(operationId, 'inspect', { actor: { ...actor, userId: 'another-account' } }))
        .status,
    ).toBe(403);
    expect(
      (await recover(operationId, 'inspect', { actor: { ...actor, profileId: randomUUID() } }))
        .status,
    ).toBe(409);
    expect(
      (await recover(operationId, 'inspect', { command: { ...command, arbitrary: true } })).status,
    ).toBe(400);
    expect(
      (
        await recoverBatch(
          request(
            '/food-data/confirmations/recovery',
            {
              operationId,
              commandPath: '/api/v1/pantry/batches',
              actor,
              command,
              action: 'inspect',
            },
            undefined,
            false,
          ),
        )
      ).status,
    ).toBe(401);
    const untrusted = request('/food-data/confirmations/recovery', {
      operationId,
      commandPath: '/api/v1/pantry/batches',
      actor,
      command,
      action: 'inspect',
    });
    untrusted.headers.set('origin', `${origin}.evil.example`);
    expect((await recoverBatch(untrusted)).status).toBe(403);
  });
  it('requires the original shopping permissions even when recovery has Pantry create scope', async () => {
    const { createAdminApiKey } = await import('@/lib/services/api-key-service');
    const key = await createAdminApiKey({
      userId: actor.userId,
      profileId: actor.profileId,
      name: 'Synthetic recovery scope',
      expiresInDays: 1,
      permissions: { pantry: ['create'] },
    });
    const operationId = randomUUID();
    const response = await recoverBatch(
      new Request(`${origin}/api/v1/food-data/confirmations/recovery`, {
        method: 'POST',
        headers: { authorization: `Bearer ${key.secret}`, 'Content-Type': 'application/json' },
        body: JSON.stringify({
          operationId,
          action: 'inspect',
          actor,
          commandPath: `/api/v1/shopping-lists/${randomUUID()}/catalog-items`,
          command: {
            operationId,
            localProductId: command.productId,
            cartQuantity: 1,
            cartUnit: 'g',
          },
        }),
      }),
    );
    expect(response.status).toBe(403);
  });
  it('labels absent receipts unknown and atomically blocks a delayed original after explicit abandonment without changing stock', async () => {
    const operationId = randomUUID();
    const before = getDatabase().select().from(pantryBatches).all();
    expect(await (await recover(operationId, 'inspect')).json()).toMatchObject({
      status: 'not_recorded',
      outcome: 'unknown',
    });
    expect(await (await recover(operationId, 'abandon')).json()).toMatchObject({
      status: 'abandoned',
      outcome: 'unknown',
    });
    const late = await createBatch(request('/pantry/batches', command, operationId));
    expect(late.status).toBe(409);
    expect(await late.json()).toMatchObject({ error: { code: 'operation_abandoned' } });
    expect(getDatabase().select().from(pantryBatches).all()).toEqual(before);
    expect(await (await recover(operationId, 'inspect')).json()).toMatchObject({
      status: 'abandoned',
      outcome: 'unknown',
    });
  });
  it('does not undo a historical batch whose expired receipt was already removed', async () => {
    const operationId = randomUUID();
    const saved = await (
      await createBatch(request('/pantry/batches', command, operationId))
    ).json();
    const receipt = getDatabase()
      .select()
      .from(apiIdempotencyRecords)
      .all()
      .find((row) => row.responseBody.includes(saved.batch.id))!;
    getDatabase()
      .delete(apiIdempotencyRecords)
      .where(eq(apiIdempotencyRecords.id, receipt.id))
      .run();
    expect(await (await recover(operationId, 'inspect')).json()).toMatchObject({
      status: 'not_recorded',
      outcome: 'unknown',
    });
    await recover(operationId, 'abandon');
    expect((await createBatch(request('/pantry/batches', command, operationId))).status).toBe(409);
    expect(
      getDatabase().select().from(pantryBatches).where(eq(pantryBatches.id, saved.batch.id)).get(),
    ).toMatchObject({ quantityRemaining: 500, unit: 'g' });
  });
  it.each(['missing', 'expired'] as const)(
    'allows receipt review and explicit closure after a %s catalog source without substituting a revision',
    async (reason) => {
      const operationId = randomUUID();
      const { productId: _productId, ...batch } = command;
      void _productId;
      const input = { ...catalogConfirmation(reviewed, operationId, 'g'), batches: [batch] };
      const originalPath = '/api/v1/pantry/catalog-imports';
      const before = getDatabase().select().from(pantryBatches).all();
      fixture.state.missingFood = reason === 'missing';
      fixture.state.revision = reason === 'expired' ? 'revision_2' : 'revision_1';
      clearCatalogStateForTests();
      const rejected = await importCatalogBatch(request('/pantry/catalog-imports', input));
      // A provider 404 for a pinned revision is deliberately mapped to a review conflict.
      expect(rejected.status).toBe(409);
      expect(await rejected.json()).toMatchObject({ error: { code: 'REVISION_EXPIRED' } });
      const providerCalls = fixture.calls.length;
      expect(
        await (
          await recover(operationId, 'inspect', { commandPath: originalPath, command: input })
        ).json(),
      ).toMatchObject({ status: 'not_recorded', outcome: 'unknown' });
      expect(
        await (
          await recover(operationId, 'abandon', { commandPath: originalPath, command: input })
        ).json(),
      ).toMatchObject({ status: 'abandoned', outcome: 'unknown' });
      expect((await importCatalogBatch(request('/pantry/catalog-imports', input))).status).toBe(
        409,
      );
      expect(fixture.calls).toHaveLength(providerCalls);
      expect(getDatabase().select().from(pantryBatches).all()).toEqual(before);
      expect(() =>
        importFoodCatalogRecord({
          input: foodCatalogImportInputSchema.parse(
            catalogConfirmation(reviewed, operationId, 'g'),
          ),
          record: reviewed,
          actorProfileId: actor.profileId,
          actorUserId: actor.userId,
          destination: 'pantry',
          batches: [batch],
        }),
      ).toThrow('closed after review');
      fixture.state.missingFood = false;
      fixture.state.revision = 'revision_1';
      clearCatalogStateForTests();
    },
  );
  it('closes a stale shopping match even after the list is deleted, and prevents direct service replay', async () => {
    const list = createManualShoppingList('Deleted recovery target', actor.profileId);
    const item = addShoppingListItem(
      list.id,
      { item: 'Oats', quantity: 2, unit: 'each', note: '', checked: false },
      actor.profileId,
    );
    const operationId = randomUUID();
    const input = {
      operationId,
      localProductId: command.productId,
      cartQuantity: 1,
      cartUnit: 'g',
      cartIntent: 'replace_existing',
      itemId: item.id,
      expectedUpdatedAt: '2000-01-01T00:00:00.000Z',
    };
    const path = `/shopping-lists/${list.id}/catalog-items`;
    const context = { params: Promise.resolve({ listId: list.id }) };
    expect((await confirmShopping(request(path, input), context)).status).toBe(409);
    getDatabase().delete(shoppingLists).where(eq(shoppingLists.id, list.id)).run();
    expect(
      await (
        await recover(operationId, 'inspect', { commandPath: `/api/v1${path}`, command: input })
      ).json(),
    ).toMatchObject({ status: 'not_recorded', outcome: 'unknown' });
    expect(
      await (
        await recover(operationId, 'abandon', { commandPath: `/api/v1${path}`, command: input })
      ).json(),
    ).toMatchObject({ status: 'abandoned', outcome: 'unknown' });
    expect((await confirmShopping(request(path, input), context)).status).toBe(409);
    await expect(
      confirmCatalogShoppingItem({
        input,
        listId: list.id,
        actorProfileId: actor.profileId,
        actorUserId: actor.userId,
      }),
    ).rejects.toThrow('closed after review');
  });
  it('finds existing domain receipts during a provider outage and after deleting the shopping target, without making another write', async () => {
    const operationId = randomUUID();
    const { productId: _productId, ...batch } = command;
    void _productId;
    const input = foodCatalogImportInputSchema.parse(
      catalogConfirmation(reviewed, operationId, 'g'),
    );
    const saved = importFoodCatalogRecord({
      input,
      record: reviewed,
      actorProfileId: actor.profileId,
      actorUserId: actor.userId,
      destination: 'pantry',
      batches: [batch],
    });
    const list = createManualShoppingList('Acknowledged deleted target', actor.profileId);
    const cart = {
      operationId: randomUUID(),
      localProductId: command.productId,
      cartQuantity: 1,
      cartUnit: 'g',
    };
    const savedCart = await confirmCatalogShoppingItem({
      input: cart,
      listId: list.id,
      actorProfileId: actor.profileId,
      actorUserId: actor.userId,
    });
    getDatabase().delete(shoppingLists).where(eq(shoppingLists.id, list.id)).run();
    const before = getDatabase().select().from(pantryBatches).all();
    fixture.state.unavailable = true;
    clearCatalogStateForTests();
    const providerCalls = fixture.calls.length;
    const recovery = await recover(operationId, 'abandon', {
      commandPath: '/api/v1/pantry/catalog-imports',
      command: { ...input, batches: [batch] },
    });
    expect(await recovery.json()).toMatchObject({
      status: 'acknowledged',
      result: { productId: saved.productId, batchIds: saved.batchIds },
    });
    expect(
      await (
        await recover(cart.operationId, 'inspect', {
          commandPath: `/api/v1/shopping-lists/${list.id}/catalog-items`,
          command: cart,
        })
      ).json(),
    ).toMatchObject({
      status: 'acknowledged',
      result: { itemId: savedCart.itemId, listId: list.id },
    });
    expect(
      (
        await recover(cart.operationId, 'inspect', {
          commandPath: `/api/v1/shopping-lists/${list.id}/catalog-items`,
          command: { ...cart, cartQuantity: 2 },
        })
      ).status,
    ).toBe(409);
    expect(fixture.calls).toHaveLength(providerCalls);
    expect(getDatabase().select().from(pantryBatches).all()).toEqual(before);
    fixture.state.unavailable = false;
    clearCatalogStateForTests();
  });
  it.each(['pantry', 'shopping'] as const)(
    'blocks an in-flight %s catalog write when explicit closure wins before the provider response',
    async (destination) => {
      const operationId = randomUUID();
      const { productId: _productId, ...batch } = command;
      void _productId;
      const list = createManualShoppingList('Delayed catalog confirmation', actor.profileId);
      const confirmation = catalogConfirmation(reviewed, operationId, 'g');
      const input =
        destination === 'pantry'
          ? { ...confirmation, batches: [batch] }
          : { ...confirmation, cartQuantity: 1, cartUnit: 'g' };
      const path =
        destination === 'pantry'
          ? '/pantry/catalog-imports'
          : `/shopping-lists/${list.id}/catalog-items`;
      const before = getDatabase().select().from(pantryBatches).all();
      let release!: () => void;
      let started!: () => void;
      const waiting = new Promise<void>((resolve) => {
        started = resolve;
      });
      const gate = new Promise<void>((resolve) => {
        release = resolve;
      });
      const originalFetch = globalThis.fetch;
      vi.stubGlobal('fetch', async (url: string | URL | Request, init?: RequestInit) => {
        const address = new URL(url instanceof Request ? url.url : String(url));
        if (address.pathname.startsWith('/v1/foods/')) {
          started();
          await gate;
        }
        return originalFetch(url, init);
      });
      clearCatalogStateForTests();
      const submitted =
        destination === 'pantry'
          ? importCatalogBatch(request(path, input))
          : confirmShopping(request(path, input), { params: Promise.resolve({ listId: list.id }) });
      try {
        await waiting;
        expect(
          await (
            await recover(operationId, 'abandon', { commandPath: `/api/v1${path}`, command: input })
          ).json(),
        ).toMatchObject({ status: 'abandoned', outcome: 'unknown' });
        release();
        expect((await submitted).status).toBe(409);
        expect(getDatabase().select().from(pantryBatches).all()).toEqual(before);
        expect(
          getDatabase()
            .select()
            .from(shoppingListItems)
            .where(eq(shoppingListItems.listId, list.id))
            .all(),
        ).toHaveLength(0);
      } finally {
        release();
        vi.stubGlobal('fetch', originalFetch);
      }
    },
  );
  it('keeps authentication required after revocation even when a matching receipt exists', async () => {
    const operationId = randomUUID();
    await createBatch(request('/pantry/batches', command, operationId));
    getDatabase().delete(session).where(eq(session.userId, actor.userId)).run();
    expect((await recover(operationId, 'inspect')).status).toBe(401);
    expect((await createBatch(request('/pantry/batches', command, operationId))).status).toBe(401);
  });
});
