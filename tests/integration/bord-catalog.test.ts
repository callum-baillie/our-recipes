import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { eq } from 'drizzle-orm';
import { randomUUID } from 'node:crypto';
import Database from 'better-sqlite3';
import { mkdtempSync, rmSync } from 'node:fs';
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
} from '@/lib/db/schema';
import { foodCatalogImportInputSchema } from '@/lib/domain/food-data';
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
  replayFoodCatalogImport,
} from '@/lib/services/food-catalog-import-service';
import {
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
import { createManualShoppingList, getShoppingList } from '@/lib/services/planning-service';
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
    fixture.state.missingFood = true;
    await expect(
      getFoodDetails(record.provider, record.providerRecordId, 'en', record.catalogRef),
    ).rejects.toMatchObject({ code: 'REVISION_EXPIRED' });
    fixture.state.unavailable = true;
    expect(replayFoodCatalogImport(input, 'catalog')).toMatchObject({
      productId: expect.any(String),
      batchIds: [],
    });
    expect(() =>
      replayFoodCatalogImport(
        { ...input, product: { ...input.product, displayName: 'Changed' } },
        'catalog',
      ),
    ).toThrow(/different data/u);
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
      for (const column of [
        'catalog_store_id',
        'catalog_generation',
        'catalog_revision',
        'catalog_metadata',
        'catalog_linked_at',
      ])
        legacy.exec(`ALTER TABLE supermarket_profiles DROP COLUMN ${column}`);
      for (const column of [
        'transport_id',
        'source_revision',
        'catalog_generation',
        'canonical_product_id',
      ])
        legacy.exec(`ALTER TABLE food_provider_snapshots DROP COLUMN ${column}`);
      legacy.exec(
        'DELETE FROM __drizzle_migrations WHERE created_at = (SELECT max(created_at) FROM __drizzle_migrations)',
      );
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
