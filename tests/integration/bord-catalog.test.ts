import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { eq } from 'drizzle-orm';
import { randomUUID } from 'node:crypto';
import Database from 'better-sqlite3';
import { mkdtempSync, readFileSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import {
  UsdaFoodDataProvider,
  normalizeCatalogUsdaFood,
} from '@/lib/providers/usda-food-data-provider';
import { getDatabase, getSqliteDatabase, resetDatabaseForTests } from '@/lib/db/client';
import {
  foodProviderRateLimits,
  foodProviderSnapshots,
  pantryBatches,
  shoppingLists,
  shoppingListItems,
} from '@/lib/db/schema';
import { foodCatalogImportInputSchema } from '@/lib/domain/food-data';
import {
  getNutritionDataWorkspace,
  getProductNutritionRecordContext,
} from '@/lib/services/nutrition-recipe-calculation-service';
import { BordCatalogClient } from '@/lib/providers/bord-catalog-client';
import { getRuntimeConfig } from '@/lib/config';
import { completeSetup } from '@/lib/services/household-service';
import { clearCatalogStateForTests, getCatalogStatus } from '@/lib/services/bord-catalog-service';
import {
  getFoodDetails,
  lookupFoodByBarcode,
  searchFoodData,
} from '@/lib/services/food-data-service';
import {
  importFoodCatalogRecord,
  confirmCatalogShoppingItem,
  replayFoodCatalogImport,
} from '@/lib/services/food-catalog-import-service';
import {
  listCatalogChains,
  linkCatalogStore,
  reviewCatalogStore,
  searchCatalogStores,
} from '@/lib/services/catalog-store-service';
import {
  createSupermarketProfile,
  getSupermarketProfile,
  listSupermarketProfiles,
  rememberShoppingAisle,
  resolveShoppingAisle,
  setSupermarketCatalogLink,
  setShoppingListSupermarket,
  updateSupermarketProfile,
} from '@/lib/services/list-settings-service';
import {
  addShoppingListItem,
  createManualShoppingList,
  getShoppingList,
} from '@/lib/services/planning-service';
import {
  readCatalogMeasures,
  searchStorageGuidance,
  enrichCatalogProducts,
} from '@/lib/services/catalog-food-context-service';
import { intakePurchasedShoppingItem } from '@/lib/services/pantry-grocery-cooking-service';
import { createPantryLocation } from '@/lib/services/pantry-service';
import { pantryPurchaseIntakeSchema } from '@/lib/domain/pantry-grocery-cooking';
import { pantryLocationInputSchema } from '@/lib/domain/pantry';
import { shoppingPurchaseDraft, cartDemandCoverage } from '@/lib/domain/shopping-cart';
import { shoppingScanConfirmation } from '../../shared/mobile-domain/catalog';
import { startCatalogFixture, syntheticUsda } from '../fixtures/bord-catalog-server';

describe('native Bòrd catalog companion (synthetic loopback only)', () => {
  let fixture: Awaited<ReturnType<typeof startCatalogFixture>>;
  let actor: string;
  const realFetch = globalThis.fetch;
  beforeEach(async () => {
    fixture = await startCatalogFixture();
    vi.stubEnv('DATABASE_URL', ':memory:');
    vi.stubEnv('BORD_FOOD_API_BASE_URL', fixture.baseUrl);
    vi.stubEnv('BORD_FOOD_API_KEY', 'synthetic-read-key');
    vi.stubEnv('FOOD_DATA_MODE', 'catalog_only');
    vi.stubEnv('FOOD_DATA_ALLOW_REMOTE_FALLBACK', 'false');
    vi.stubEnv('STORE_DIRECTORY_ENABLED', 'true');
    vi.stubGlobal(
      'fetch',
      vi.fn((input: string | URL | Request, init?: RequestInit) => {
        const url = new URL(input instanceof Request ? input.url : String(input));
        if (url.origin !== fixture.baseUrl) throw new Error('External egress denied by fixture');
        expect(init?.redirect).toBe('error');
        expect(new Headers(init?.headers).get('x-api-key')).toBe('synthetic-read-key');
        return realFetch(input, init);
      }),
    );
    clearCatalogStateForTests();
    resetDatabaseForTests();
    actor = completeSetup({
      householdName: 'Catalog fixture',
      appName: 'Bòrd',
      profile: {
        displayName: 'Maya',
        color: '#637A45',
        avatarUrl: '',
        units: 'metric',
        temperatureUnit: 'C',
        locale: 'en-US',
        timezone: 'America/Chicago',
      },
    }).profiles[0]!.id;
  });
  afterEach(async () => {
    resetDatabaseForTests();
    clearCatalogStateForTests();
    vi.unstubAllGlobals();
    vi.unstubAllEnvs();
    await fixture.close();
  });

  function profile() {
    createSupermarketProfile(
      {
        name: 'My weekly store',
        locationLabel: 'My branch',
        notes: 'Keep these notes',
        sections: [
          { aisleId: '', name: 'My produce', matchTerms: ['apples'] },
          { aisleId: '', name: 'My bakery', matchTerms: ['bread'] },
        ],
      },
      actor,
    );
    return listSupermarketProfiles().find((p) => p.name === 'My weekly store')!;
  }
  it('T36: preserves profile UUID, custom route/aisle IDs, manual overrides and list relationships through link/rename/refresh/unlink', async () => {
    const saved = profile();
    rememberShoppingAisle(saved.id, 'bread', null, saved.sections[0]!.aisleId, actor);
    const list = createManualShoppingList('Fixture list', actor);
    setShoppingListSupermarket(list.id, saved.id, actor);
    const result = await searchCatalogStores({ query: 'Fixture' });
    await linkCatalogStore(
      saved.id,
      result.stores[0]!.id,
      result.stores[0]!.content_revision,
      actor,
    );
    expect(getSupermarketProfile(saved.id)).toMatchObject({
      name: saved.name,
      notes: saved.notes,
      sections: saved.sections,
    });
    const linked = getSupermarketProfile(saved.id)!;
    updateSupermarketProfile(
      saved.id,
      {
        name: 'Renamed locally',
        locationLabel: saved.locationLabel,
        notes: saved.notes,
        sections: saved.sections.map(({ aisleId, name, matchTerms }) => ({
          aisleId,
          name,
          matchTerms,
        })),
        archived: false,
      },
      actor,
    );
    fixture.state.storeRevision = 'store_2';
    const review = await reviewCatalogStore(saved.id);
    expect(review.changed).toBe(true);
    expect(review.maps[0]).toMatchObject({
      displayPermitted: false,
      sourceUrl: 'https://retailer.example.test/official-map',
    });
    expect(getSupermarketProfile(saved.id)!.catalogMetadata).toBe(linked.catalogMetadata);
    await linkCatalogStore(saved.id, 'sto_fixture', 'store_2', actor);
    setSupermarketCatalogLink(saved.id, null, actor);
    expect(getSupermarketProfile(saved.id)).toMatchObject({
      id: saved.id,
      name: 'Renamed locally',
      notes: saved.notes,
      locationLabel: saved.locationLabel,
      sections: saved.sections,
      catalogStoreId: null,
      catalogMetadata: null,
    });
    expect(resolveShoppingAisle(saved.id, { item: 'bread' })).toBe(saved.sections[0]!.aisleId);
    expect(getShoppingList(list.id)!.supermarketProfileId).toBe(saved.id);
    expect(
      getDatabase().select().from(shoppingLists).where(eq(shoppingLists.id, list.id)).get()!
        .supermarketProfileId,
    ).toBe(saved.id);
  });
  it('T37: exact revisions are reloaded; rotation requires renewed review and retains durable nutrition snapshots', async () => {
    const { record } = await getFoodDetails('usda_fdc', '123', 'en');
    expect(record.catalogRef).toMatchObject({
      transport_id: 'bord_food_api',
      source_id: 'usda_fdc',
      source_revision: 'revision_1',
    });
    const input = foodCatalogImportInputSchema.parse({
      operationId: randomUUID(),
      selection: {
        provider: record.provider,
        recordId: record.providerRecordId,
        catalogRef: record.catalogRef,
      },
      product: { displayName: 'Reviewed household oats' },
    });
    const reloaded = await getFoodDetails(
      record.provider,
      record.providerRecordId,
      'en',
      record.catalogRef,
    );
    importFoodCatalogRecord({
      input,
      record: reloaded.record,
      actorProfileId: actor,
      destination: 'catalog',
    });
    expect(getDatabase().select().from(pantryBatches).all()).toHaveLength(0);
    const snapshot = getDatabase().select().from(foodProviderSnapshots).get()!;
    const savedProduct = getNutritionDataWorkspace().products.find(
      (product) => product.displayName === 'Reviewed household oats',
    )!;
    expect(getProductNutritionRecordContext(savedProduct.id).preferredRecord).toMatchObject({
      id: savedProduct.record!.id,
      catalogRef: record.catalogRef,
    });
    expect(
      getProductNutritionRecordContext(savedProduct.id).preferredRecord?.supportedUnits,
    ).toContain('g');
    expect(
      getNutritionDataWorkspace().products.find(
        (product) => product.displayName === 'Reviewed household oats',
      )?.record?.catalogRef,
    ).toEqual(record.catalogRef);
    expect(snapshot).toMatchObject({
      transportId: 'bord_food_api',
      sourceRevision: 'revision_1',
      catalogGeneration: 'g_fixture_1',
    });
    fixture.state.revision = 'revision_2';
    fixture.state.generation = 'g_fixture_2';
    fixture.state.protein = 99;
    await expect(
      getFoodDetails(record.provider, record.providerRecordId, 'en', record.catalogRef),
    ).rejects.toMatchObject({ code: 'REVISION_EXPIRED' });
    expect(getDatabase().select().from(foodProviderSnapshots).get()).toEqual(snapshot);
    expect(
      getNutritionDataWorkspace().products.find(
        (product) => product.displayName === 'Reviewed household oats',
      )?.record?.catalogRef,
    ).toEqual(record.catalogRef);
    fixture.state.missingFood = true;
    await expect(
      getFoodDetails(record.provider, record.providerRecordId, 'en', record.catalogRef),
    ).rejects.toMatchObject({ code: 'REVISION_EXPIRED' });
    fixture.state.unavailable = true;
    expect(replayFoodCatalogImport(input, 'catalog', actor)).toMatchObject({
      productId: expect.any(String),
      batchIds: [],
    });
    expect(() =>
      replayFoodCatalogImport(
        { ...input, product: { ...input.product, displayName: 'Changed' } },
        'catalog',
        actor,
      ),
    ).toThrow(/different data/u);
  });
  it('reads revision-bound measures and attributed guidance without inventing conversions or expiry', async () => {
    const { record } = await getFoodDetails('usda_fdc', '123', 'en');
    const result = await readCatalogMeasures({ reference: record.catalogRef });
    expect(result.measures).toEqual([
      {
        label: '1 cup · chopped',
        amount: 1,
        unit: 'cup',
        modifier: 'chopped',
        description: null,
        gramWeight: 120,
        form: 'raw',
        basis: null,
      },
      {
        label: '1 piece',
        amount: 1,
        unit: 'piece',
        modifier: null,
        description: null,
        gramWeight: null,
        form: null,
        basis: null,
      },
    ]);
    const guidance = await searchStorageGuidance({ query: 'oats' });
    expect(guidance.guidance[0]).toMatchObject({
      attribution: 'USDA FSIS FoodKeeper',
      preciseExpiry: false,
      details: { Refrigerate_Min: 0, Refrigerate_Max: null },
    });
    expect(JSON.stringify(guidance)).not.toContain('private_unprojected');
    fixture.state.revision = 'revision_2';
    await expect(readCatalogMeasures({ reference: record.catalogRef })).rejects.toMatchObject({
      code: 'REVISION_EXPIRED',
    });
    fixture.state.guidanceUnavailable = true;
    await expect(searchStorageGuidance({ query: 'oats' })).rejects.toMatchObject({
      code: 'DISABLED',
    });
    expect(getDatabase().select().from(pantryBatches).all()).toHaveLength(0);
  });
  it('enriches only identified products, preserves unknown availability and rejects response identity drift', async () => {
    const input = {
      lines: [{ lineId: 'line-1', productId: 'prd_fixture', storeId: 'sto_fixture' }],
    };
    const result = await enrichCatalogProducts(input);
    expect(result.lines[0]).toMatchObject({
      lineId: 'line-1',
      product: { id: 'prd_fixture' },
      evidence: { availability: 'unknown', offers: [] },
    });
    expect(fixture.calls.at(-1)?.body).toEqual({
      lines: [{ line_id: 'line-1', product_id: 'prd_fixture', store_id: 'sto_fixture' }],
    });
    await expect(
      enrichCatalogProducts({ lines: [{ lineId: 'line-1', query: 'oats' }] }),
    ).rejects.toThrow();
    fixture.state.mismatchEnrichment = true;
    await expect(enrichCatalogProducts(input)).rejects.toMatchObject({
      code: 'MALFORMED_RESPONSE',
    });
  });
  it('binds durable import replay to the actor and normalized intent before provider access', async () => {
    const { record } = await getFoodDetails('usda_fdc', '123', 'en');
    const input = foodCatalogImportInputSchema.parse({
      operationId: randomUUID(),
      selection: {
        provider: record.provider,
        recordId: record.providerRecordId,
        catalogRef: record.catalogRef,
      },
      product: { displayName: 'Account-bound oats' },
    });
    const saved = importFoodCatalogRecord({
      input,
      record,
      actorProfileId: actor,
      actorUserId: 'account-a',
      destination: 'catalog',
    });
    fixture.state.unavailable = true;
    const calls = fixture.calls.length;
    expect(replayFoodCatalogImport(input, 'catalog', actor, [], 'account-a')?.productId).toBe(
      saved.productId,
    );
    expect(() => replayFoodCatalogImport(input, 'catalog', actor, [], 'account-b')).toThrow();
    expect(() =>
      replayFoodCatalogImport(input, 'catalog', randomUUID(), [], 'account-a'),
    ).toThrow();
    expect(fixture.calls).toHaveLength(calls);
  });
  it('atomically preserves scanned identity in a shopping item and safely replays a lost response during outage', async () => {
    const list = createManualShoppingList('Scan review', actor);
    const { record } = await getFoodDetails('usda_fdc', '123', 'en');
    const input = {
      ...foodCatalogImportInputSchema.parse({
        operationId: randomUUID(),
        selection: {
          provider: record.provider,
          recordId: record.providerRecordId,
          catalogRef: record.catalogRef,
        },
        product: { displayName: 'Reviewed scanned oats' },
      }),
      cartQuantity: 2,
      cartUnit: 'each',
    };
    const args = { input, listId: list.id, actorProfileId: actor, actorUserId: 'account-a' };
    const saved = await confirmCatalogShoppingItem(args);
    const item = getShoppingList(list.id)!.items[0];
    expect(item).toMatchObject({
      id: saved.itemId,
      shoppingState: 'in_cart',
      cartQuantity: 2,
      quantity: null,
      pantry: { productId: saved.productId },
    });
    expect(getDatabase().select().from(foodProviderSnapshots).get()).toMatchObject({
      sourceRevision: 'revision_1',
      transportId: 'bord_food_api',
    });
    expect(getDatabase().select().from(pantryBatches).all()).toHaveLength(0);
    fixture.state.unavailable = true;
    const calls = fixture.calls.length;
    expect(await confirmCatalogShoppingItem(args)).toMatchObject({ ...saved, replayed: true });
    expect(getShoppingList(list.id)!.items).toHaveLength(1);
    expect(fixture.calls).toHaveLength(calls);
    await expect(
      confirmCatalogShoppingItem({ ...args, input: { ...input, cartQuantity: 3 } }),
    ).rejects.toThrow(/different/u);
    await expect(
      confirmCatalogShoppingItem({ ...args, actorUserId: 'another-account' }),
    ).rejects.toThrow(/different/u);
  });
  it('keeps purchase units through persisted cart review and Pantry intake without changing demand', async () => {
    const list = createManualShoppingList('Dimension review', actor);
    const { record } = await getFoodDetails('usda_fdc', '123', 'en');
    const imported = importFoodCatalogRecord({
      input: foodCatalogImportInputSchema.parse({
        operationId: randomUUID(),
        selection: {
          provider: record.provider,
          recordId: record.providerRecordId,
          catalogRef: record.catalogRef,
        },
        product: { displayName: 'Reviewed food' },
      }),
      record,
      actorProfileId: actor,
      actorUserId: 'account-a',
      destination: 'catalog',
    });
    const demand = addShoppingListItem(
      list.id,
      {
        item: 'Food demand',
        quantity: 2,
        unit: 'each',
        note: '',
        checked: false,
        productId: imported.productId,
      },
      actor,
    );
    const input = {
      operationId: randomUUID(),
      localProductId: imported.productId,
      itemId: demand.id,
      expectedUpdatedAt: demand.updatedAt.toISOString(),
      cartIntent: 'replace_existing',
      cartQuantity: 500,
      cartUnit: 'g',
    };
    const args = { input, listId: list.id, actorProfileId: actor, actorUserId: 'account-a' };
    const saved = await confirmCatalogShoppingItem(args);
    const item = getShoppingList(list.id)!.items.find((row) => row.id === demand.id)!;
    expect(item).toMatchObject({
      quantity: 2,
      unit: 'each',
      cartQuantity: 500,
      cartUnit: 'g',
      shoppingState: 'in_cart',
    });
    const draft = shoppingPurchaseDraft(item);
    expect(draft).toEqual({ quantity: '500', unit: 'g' });
    const location = createPantryLocation(
      pantryLocationInputSchema.parse({ name: 'Fixture cupboard', storageType: 'pantry' }),
      actor,
    );
    const intake = pantryPurchaseIntakeSchema.parse({
      operationKey: 'dimension-intake-1',
      productId: imported.productId,
      locationId: location.id,
      quantity: Number(draft.quantity),
      unit: draft.unit,
      intakeMode: 'partial' as const,
    });
    const received = intakePurchasedShoppingItem(list.id, demand.id, intake, actor);
    expect(
      getDatabase()
        .select()
        .from(pantryBatches)
        .where(eq(pantryBatches.id, received.batchId))
        .get(),
    ).toMatchObject({ quantityRemaining: 500, unit: 'g' });
    expect(intakePurchasedShoppingItem(list.id, demand.id, intake, actor)).toMatchObject({
      batchId: received.batchId,
      replayed: true,
    });
    fixture.state.unavailable = true;
    expect(await confirmCatalogShoppingItem(args)).toMatchObject({ ...saved, replayed: true });
    expect(getShoppingList(list.id)!.items).toHaveLength(1);
    // A new confirmation has separate-entry intent and must not deduplicate into
    // the original demand row or increment its existing cart quantity.
    const separate = await confirmCatalogShoppingItem({
      ...args,
      input: {
        operationId: randomUUID(),
        localProductId: imported.productId,
        cartIntent: 'separate_entry',
        cartQuantity: 0,
        cartUnit: 'kg',
      },
    });
    expect(separate.itemId).not.toBe(demand.id);
    expect(getShoppingList(list.id)!.items).toHaveLength(2);
    expect(getShoppingList(list.id)!.items.find((row) => row.id === separate.itemId)).toMatchObject(
      { cartQuantity: 0, cartUnit: 'kg', shoppingState: 'in_cart' },
    );
    getDatabase()
      .update(shoppingListItems)
      .set({ updatedAt: new Date(Date.now() + 5000) })
      .where(eq(shoppingListItems.id, demand.id))
      .run();
    await expect(
      confirmCatalogShoppingItem({
        ...args,
        input: { ...input, operationId: randomUUID(), cartQuantity: 600 },
      }),
    ).rejects.toThrow(/changed/);
    expect(getShoppingList(list.id)!.items.find((row) => row.id === demand.id)).toMatchObject({
      cartQuantity: 500,
      cartUnit: 'g',
      quantity: 2,
      unit: 'each',
    });
  });
  it('returns the saved local identity on repeat scans with the provider both available and unavailable', async () => {
    const lookup = await lookupFoodByBarcode('04006381333931', 'en');
    const record = lookup.preferred!;
    const input = foodCatalogImportInputSchema.parse({
      operationId: randomUUID(),
      selection: {
        provider: record.provider,
        recordId: record.providerRecordId,
        expectedCanonicalGtin: record.canonicalGtin,
        catalogRef: record.catalogRef,
      },
      product: { displayName: 'Repeated barcode product', defaultInventoryUnit: 'g' },
    });
    const imported = importFoodCatalogRecord({
      input,
      record,
      actorProfileId: actor,
      destination: 'catalog',
    });
    const before = fixture.calls.length;
    for (const unavailable of [false, true]) {
      fixture.state.unavailable = unavailable;
      const repeated = await lookupFoodByBarcode('04006381333931', 'en');
      expect(repeated).toMatchObject({
        preferred: null,
        alternatives: [],
        localProduct: { id: imported.productId, displayName: 'Repeated barcode product' },
      });
      expect(fixture.calls).toHaveLength(before);
    }
    expect(getSqliteDatabase().prepare('SELECT count(*) AS n FROM pantry_products').get()).toEqual({
      n: 1,
    });
    expect(getDatabase().select().from(pantryBatches).all()).toHaveLength(0);
  });
  it('RV scan confirms local-only outage matches with explicit replace/separate amounts through persisted purchase intake', async () => {
    const first = await lookupFoodByBarcode('04006381333931', 'en');
    const record = first.preferred!;
    const imported = importFoodCatalogRecord({
      input: foodCatalogImportInputSchema.parse({
        operationId: randomUUID(),
        selection: {
          provider: record.provider,
          recordId: record.providerRecordId,
          expectedCanonicalGtin: record.canonicalGtin,
          catalogRef: record.catalogRef,
        },
        product: { displayName: 'RV saved oats', defaultInventoryUnit: 'g' },
      }),
      record,
      actorProfileId: actor,
      actorUserId: 'rv-account',
      destination: 'catalog',
    });
    const list = createManualShoppingList('RV scan list', actor);
    const demand = addShoppingListItem(
      list.id,
      {
        item: 'Oats',
        quantity: 2,
        unit: 'each',
        note: '',
        checked: false,
        productId: imported.productId,
      },
      actor,
    );
    await confirmCatalogShoppingItem({
      listId: list.id,
      actorProfileId: actor,
      actorUserId: 'rv-account',
      input: {
        operationId: randomUUID(),
        localProductId: imported.productId,
        itemId: demand.id,
        expectedUpdatedAt: demand.updatedAt.toISOString(),
        cartQuantity: 500,
        cartUnit: 'g',
        cartIntent: 'replace_existing',
      },
    });
    fixture.state.unavailable = true;
    const beforeCalls = fixture.calls.length;
    const review = await lookupFoodByBarcode('04006381333931', 'en');
    expect(review).toMatchObject({
      preferred: null,
      alternatives: [],
      localProduct: { id: imported.productId },
    });
    const old = getShoppingList(list.id)!.items[0];
    const replacement = shoppingScanConfirmation({
      operationId: randomUUID(),
      localProduct: review.localProduct!,
      record: null,
      quantity: '1',
      unit: 'g',
      item: { id: old.id, updatedAt: old.updatedAt.toISOString() },
    });
    const args = {
      listId: list.id,
      actorProfileId: actor,
      actorUserId: 'rv-account',
      input: replacement,
    };
    const saved = await confirmCatalogShoppingItem(args);
    const row = getShoppingList(list.id)!.items[0];
    expect(row).toMatchObject({
      quantity: 2,
      unit: 'each',
      cartQuantity: 1,
      cartUnit: 'g',
      checked: false,
      shoppingState: 'in_cart',
      pantry: { productId: imported.productId },
    });
    expect(cartDemandCoverage(row)).toEqual({ complete: false, remaining: null });
    expect(await confirmCatalogShoppingItem(args)).toMatchObject({ ...saved, replayed: true });
    const separate = await confirmCatalogShoppingItem({
      ...args,
      input: shoppingScanConfirmation({
        operationId: randomUUID(),
        localProduct: review.localProduct!,
        record: null,
        quantity: '500',
        unit: 'g',
      }),
    });
    const separateRow = getShoppingList(list.id)!.items.find(
      (entry) => entry.id === separate.itemId,
    )!;
    expect(separateRow).toMatchObject({
      quantity: null,
      unit: '',
      cartQuantity: 500,
      cartUnit: 'g',
      checked: false,
    });
    expect(getShoppingList(list.id)!.items.find((entry) => entry.id === demand.id)).toMatchObject({
      cartQuantity: 1,
      cartUnit: 'g',
      quantity: 2,
      unit: 'each',
    });
    const location = createPantryLocation(
      pantryLocationInputSchema.parse({ name: 'RV cupboard', storageType: 'pantry' }),
      actor,
    );
    const draft = shoppingPurchaseDraft(separateRow);
    const intake = pantryPurchaseIntakeSchema.parse({
      operationKey: randomUUID(),
      productId: imported.productId,
      locationId: location.id,
      quantity: Number(draft.quantity),
      unit: draft.unit,
      intakeMode: 'partial',
    });
    const received = intakePurchasedShoppingItem(list.id, separate.itemId, intake, actor);
    expect(
      getDatabase()
        .select()
        .from(pantryBatches)
        .where(eq(pantryBatches.id, received.batchId))
        .get(),
    ).toMatchObject({ quantityRemaining: 500, unit: 'g' });
    expect(intakePurchasedShoppingItem(list.id, separate.itemId, intake, actor)).toMatchObject({
      batchId: received.batchId,
      replayed: true,
    });
    expect(getDatabase().select().from(pantryBatches).all()).toHaveLength(1);
    expect(fixture.calls).toHaveLength(beforeCalls);
  });
  it('forwards bounded store filters and rejects incomplete coordinates', async () => {
    await searchCatalogStores({
      chainId: 'chain_fixture',
      state: 'IA',
      latitude: 41.5,
      longitude: -93.6,
      radiusKm: 5,
      cursor: 'opaque-cursor',
    });
    const url = new URL(fixture.calls.at(-1)!.path, fixture.baseUrl);
    expect(Object.fromEntries(url.searchParams)).toMatchObject({
      chain_id: 'chain_fixture',
      state: 'IA',
      lat: '41.5',
      lon: '-93.6',
      radius_km: '5',
      cursor: 'opaque-cursor',
      limit: '20',
    });
    await expect(searchCatalogStores({ latitude: 41.5 })).rejects.toThrow();
  });
  it('T38/39: denies external fallback/images, preserves source identity and does not spend external quota or add stock/cart', async () => {
    const counts = getSqliteDatabase().prepare('SELECT count(*) AS n FROM pantry_products').get();
    const result = await lookupFoodByBarcode('04006381333931', 'en', true);
    expect(result.preferred).toMatchObject({
      provider: 'open_food_facts',
      images: [],
      catalogRef: { canonical_product_id: 'prd_fixture' },
    });
    expect(getDatabase().select().from(foodProviderRateLimits).all()).toHaveLength(0);
    const evidence = await new BordCatalogClient().retailEvidence('prd_fixture', 'sto_fixture');
    expect(evidence.data).toMatchObject({ availability: 'unknown', offers: [], placements: [] });
    expect(getSqliteDatabase().prepare('SELECT count(*) AS n FROM pantry_products').get()).toEqual(
      counts,
    );
    expect(getDatabase().select().from(pantryBatches).all()).toHaveLength(0);
    fixture.state.unavailable = true;
    expect((await lookupFoodByBarcode('04006381333931', 'en')).preferred).toBeNull();
    expect(fixture.calls.every((c) => c.key === 'synthetic-read-key')).toBe(true);
  });
  it('keeps local USDA barcodes working when the optional product pack is unavailable', async () => {
    fixture.state.productsUnavailable = true;
    fixture.state.barcodeMatch = true;
    const result = await lookupFoodByBarcode('04006381333931', 'en');
    expect(result.preferred).toMatchObject({
      provider: 'usda_fdc',
      canonicalGtin: '04006381333931',
      images: [],
      catalogRef: { source_id: 'usda_fdc', source_revision: 'revision_1' },
    });
    expect(result.providerStatuses).toEqual(
      expect.arrayContaining([
        expect.objectContaining({ provider: 'usda_fdc', status: 'available' }),
      ]),
    );
    expect(getDatabase().select().from(foodProviderRateLimits).all()).toHaveLength(0);
    expect(getDatabase().select().from(pantryBatches).all()).toHaveLength(0);
  });
  it('skips disabled product resolution while preserving exact local USDA barcode matches', async () => {
    fixture.state.productsDisabled = true;
    fixture.state.barcodeMatch = true;
    const result = await lookupFoodByBarcode('04006381333931', 'en');
    expect(result.preferred).toMatchObject({
      provider: 'usda_fdc',
      canonicalGtin: '04006381333931',
      catalogRef: { source_revision: 'revision_1' },
    });
    expect(result.providerStatuses).toContainEqual(
      expect.objectContaining({ provider: 'open_food_facts', status: 'disabled' }),
    );
    expect(fixture.calls.some((call) => call.path.startsWith('/v1/products/resolve'))).toBe(false);
    expect(getDatabase().select().from(foodProviderRateLimits).all()).toHaveLength(0);
  });
  it('rejects a resolver response for a different scanned GTIN', async () => {
    const result = await lookupFoodByBarcode('00036000291452', 'en');
    expect(result.preferred).toBeNull();
    expect(result.alternatives).toEqual([]);
    expect(result.providerStatuses).toContainEqual(
      expect.objectContaining({
        provider: 'open_food_facts',
        status: 'invalid_response',
      }),
    );
    expect(fixture.calls.some((call) => call.path.startsWith('/v1/foods/open_food_facts/'))).toBe(
      false,
    );
  });
  it('rejects source details that no longer match the resolved barcode and tries local USDA', async () => {
    fixture.state.barcodeMatch = true;
    const originalFetch = globalThis.fetch;
    vi.stubGlobal('fetch', async (input: string | URL | Request, init?: RequestInit) => {
      const response = await originalFetch(input, init);
      if (!String(input).includes('/v1/products/resolve')) return response;
      const body = await response.json();
      body.data[0].identifier.value = '00036000291452';
      return Response.json(body);
    });
    const result = await lookupFoodByBarcode('00036000291452', 'en');
    expect(result.preferred).toBeNull();
    expect(result.providerStatuses).toContainEqual(
      expect.objectContaining({
        provider: 'open_food_facts',
        status: 'invalid_response',
      }),
    );
    expect(fixture.calls.some((call) => call.path.startsWith('/fdc/v1/foods/search'))).toBe(true);
  });
  it('isolates config, generation and normalizer caches and polls generation after five minutes', async () => {
    const now = Date.now();
    const clock = vi.spyOn(Date, 'now').mockReturnValue(now);
    expect((await searchFoodData('oats', 1, 'generic')).cache.hit).toBe(false);
    expect((await searchFoodData('oats', 1, 'generic')).cache.hit).toBe(true);
    fixture.state.generation = 'g_fixture_2';
    clock.mockReturnValue(now + 300_001);
    expect((await searchFoodData('oats', 1, 'generic')).cache.hit).toBe(false);
    vi.stubEnv('BORD_FOOD_API_KEY', 'another-key');
    // Key rotation changes the fingerprint; use the real loopback fetch to inspect the new key.
    vi.stubGlobal('fetch', realFetch);
    expect((await searchFoodData('oats', 1, 'generic')).cache.hit).toBe(false);
    expect(fixture.calls.at(-1)?.key).toBe('another-key');
    clock.mockRestore();
  });
  it('T40: distinguishes initializing, disabled, partial, stale and rights-blocked without disabling manual stores', async () => {
    const saved = profile();
    fixture.state.initializing = true;
    await expect(searchCatalogStores({ query: 'Fixture' })).rejects.toMatchObject({
      code: 'INITIALIZING',
    });
    expect((await getCatalogStatus()).state).toBe('initializing');
    fixture.state.initializing = false;
    fixture.state.partial = true;
    clearCatalogStateForTests();
    expect((await getCatalogStatus()).state).toBe('partial');
    fixture.state.partial = false;
    fixture.state.stale = true;
    clearCatalogStateForTests();
    expect((await getCatalogStatus()).state).toBe('stale');
    fixture.state.stale = false;
    fixture.state.disabled = true;
    clearCatalogStateForTests();
    expect((await getCatalogStatus()).state).toBe('disabled');
    fixture.state.disabled = false;
    fixture.state.rightsBlocked = true;
    clearCatalogStateForTests();
    expect((await getCatalogStatus()).state).toBe('rights_blocked');
    expect(getSupermarketProfile(saved.id)!.sections).toEqual(saved.sections);
    expect(resolveShoppingAisle(saved.id, { item: 'bread' })).toBe(saved.sections[1]!.aisleId);
    expect(JSON.stringify(await getCatalogStatus())).not.toContain('synthetic-read-key');
    expect(JSON.stringify(await getCatalogStatus())).not.toContain(fixture.baseUrl);
  });
  it('lists bounded human chain choices without loading private store details', async () => {
    const response = await listCatalogChains({ country: 'US' });
    expect(response.chains).toEqual([
      { id: 'chn_fixture', name: 'Fixture Market', observedStoreCount: 2 },
    ]);
    expect(fixture.calls.at(-1)?.path).toContain('limit=50');
    await expect(listCatalogChains({ country: 'USA' })).rejects.toThrow();
  });
  it('upgrades the previous schema additively while preserving manual profiles and routes', async () => {
    const saved = profile();
    const directory = mkdtempSync(join(tmpdir(), 'bord-catalog-migration-'));
    const path = join(directory, 'legacy.db');
    try {
      const appliedBefore = getSqliteDatabase()
        .prepare('SELECT count(*) AS n FROM __drizzle_migrations')
        .get();
      await getSqliteDatabase().backup(path);
      const legacy = new Database(path);
      const journal = JSON.parse(
        readFileSync(join(process.cwd(), 'drizzle/meta/_journal.json'), 'utf8'),
      ) as { entries: Array<{ when: number; tag: string }> };
      // Rewind tables introduced after the tested prefix as new additive migrations arrive.
      for (const entry of journal.entries.filter((item) => item.when >= 1792281600000).reverse()) {
        const sql = readFileSync(join(process.cwd(), `drizzle/${entry.tag}.sql`), 'utf8');
        for (const match of sql.matchAll(
          /CREATE\s+(?:UNIQUE\s+)?INDEX\s+(?:IF NOT EXISTS\s+)?[`"]?([a-z_0-9]+)[`"]?/giu,
        ))
          legacy.exec(`DROP INDEX IF EXISTS "${match[1]}"`);
        for (const match of sql.matchAll(
          /ALTER TABLE\s+[`"]?([a-z_0-9]+)[`"]?\s+ADD COLUMN\s+[`"]?([a-z_0-9]+)[`"]?/giu,
        ))
          legacy.exec(`ALTER TABLE "${match[1]}" DROP COLUMN "${match[2]}"`);
        for (const match of sql.matchAll(
          /CREATE TABLE\s+(?:IF NOT EXISTS\s+)?[`"]?([a-z_0-9]+)[`"]?/giu,
        ))
          legacy.exec(`DROP TABLE IF EXISTS "${match[1]}"`);
      }
      legacy.exec('DELETE FROM __drizzle_migrations WHERE created_at >= 1792281600000');
      legacy.close();
      resetDatabaseForTests();
      vi.stubEnv('DATABASE_URL', path);
      expect(getSupermarketProfile(saved.id)).toMatchObject({
        id: saved.id,
        name: saved.name,
        notes: saved.notes,
        sections: saved.sections,
        catalogStoreId: null,
      });
      expect(
        getSqliteDatabase().prepare('SELECT count(*) AS n FROM __drizzle_migrations').get(),
      ).toEqual(appliedBefore);
      expect(getSqliteDatabase().pragma('foreign_key_check')).toEqual([]);
    } finally {
      resetDatabaseForTests();
      rmSync(directory, { recursive: true, force: true });
    }
  });
  it('keeps preferred fallback opt-in and isolates direct/catalog caches across mode switches', async () => {
    fixture.state.unavailable = true;
    vi.stubEnv('FOOD_DATA_MODE', 'catalog_preferred');
    vi.stubEnv('USDA_FDC_API_KEY', 'synthetic-direct-key');
    const record = normalizeCatalogUsdaFood(syntheticUsda);
    const direct = vi
      .spyOn(UsdaFoodDataProvider.prototype, 'searchByName')
      .mockResolvedValue({ value: [record], rateLimit: null, rateRemaining: null, retryAt: null });
    try {
      expect((await searchFoodData('oats', 1, 'generic')).records).toHaveLength(0);
      expect(direct).not.toHaveBeenCalled();
      vi.stubEnv('FOOD_DATA_ALLOW_REMOTE_FALLBACK', 'true');
      expect((await searchFoodData('oats', 1, 'generic')).records).toHaveLength(1);
      expect(direct).toHaveBeenCalledTimes(1);
      vi.stubEnv('FOOD_DATA_MODE', 'catalog_only');
      expect((await searchFoodData('oats', 1, 'generic')).records).toHaveLength(0);
      expect(direct).toHaveBeenCalledTimes(1);
      vi.stubEnv('FOOD_DATA_MODE', 'direct');
      expect((await searchFoodData('oats', 1, 'generic')).cache.hit).toBe(false);
      expect(direct).toHaveBeenCalledTimes(2);
    } finally {
      direct.mockRestore();
    }
  });
  it('validates server configuration and never exposes keys in its sanitized status', async () => {
    vi.stubEnv('BORD_FOOD_API_BASE_URL', 'https://user:password@example.test');
    expect(() => getRuntimeConfig()).toThrow();
    vi.stubEnv('BORD_FOOD_API_BASE_URL', fixture.baseUrl);
    vi.stubEnv('FOOD_DATA_MODE', 'typo');
    expect(() => getRuntimeConfig()).toThrow();
    vi.stubEnv('FOOD_DATA_MODE', 'catalog_only');
    vi.stubEnv('FOOD_DATA_ALLOW_REMOTE_FALLBACK', 'yes');
    expect(() => getRuntimeConfig()).toThrow();
  });
});
