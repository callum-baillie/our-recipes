import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { eq, sql } from 'drizzle-orm';

import { getDatabase, resetDatabaseForTests } from '@/lib/db/client';
import {
  mealPlanEntries,
  pantryBatches,
  pantryProducts,
  recipes,
  shoppingListItems,
  shoppingLists,
} from '@/lib/db/schema';
import {
  pantryBatchInputSchema,
  pantryBatchUpdateSchema,
  pantryLocationInputSchema,
  pantryProductInputSchema,
} from '@/lib/domain/pantry';
import { completeSetup } from '@/lib/services/household-service';
import {
  applyPantryBatchAction,
  consumePantryProductStock,
  createPantryBatch,
  createPantryLocation,
  createPantryProduct,
  ensureDefaultPantryLocations,
  getPantryDashboard,
  listPantryEvents,
  listPantryLocations,
  PantryConflictError,
  updatePantryBatch,
  updatePantryLocation,
  updatePantryProduct,
} from '@/lib/services/pantry-service';

describe('Pantry service', () => {
  let profileId: string;
  let locationId: string;

  beforeEach(() => {
    vi.stubEnv('DATABASE_URL', ':memory:');
    vi.stubEnv('DATA_DIR', './.test-data/pantry-media');
    resetDatabaseForTests();
    profileId = completeSetup({
      householdName: 'The Pantry Table',
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
    ensureDefaultPantryLocations(profileId);
    locationId = listPantryLocations().find((location) => location.name === 'Kitchen pantry')!.id;
  });

  afterEach(() => {
    resetDatabaseForTests();
    vi.unstubAllEnvs();
  });

  function product(name = 'Red lentils') {
    return createPantryProduct(
      pantryProductInputSchema.parse({
        displayName: name,
        aliases: [`${name} alias`],
        defaultInventoryUnit: 'g',
        defaultStorageType: 'pantry',
        isStaple: true,
        reorderThreshold: 200,
        stockUnit: 'g',
      }),
      profileId,
    );
  }

  function batch(productId: string, quantityRemaining: number, unit: string, useByDate: string) {
    return createPantryBatch(
      pantryBatchInputSchema.parse({
        productId,
        quantityRemaining,
        originalQuantity: quantityRemaining,
        unit,
        locationId,
        useByDate,
        expiryPrecision: 'exact',
      }),
      profileId,
    );
  }

  it('creates canonical products and distinct physical batches with attributed history', () => {
    const lentils = product();
    const first = batch(lentils.id, 500, 'g', '2027-01-05');
    const second = batch(lentils.id, 1, 'kg', '2027-03-01');

    const dashboard = getPantryDashboard();
    expect(dashboard.products[0]).toMatchObject({
      id: lentils.id,
      aliases: ['Red lentils alias'],
    });
    expect(dashboard.batches.map((item) => item.id)).toEqual([first.id, second.id]);
    expect(listPantryEvents()).toHaveLength(2);
    expect(listPantryEvents()[0]).toMatchObject({
      actorProfileId: profileId,
      eventType: 'item_added',
    });
  });

  it('consumes exact compatible stock first-expiring-first across batches', () => {
    const lentils = product();
    const first = batch(lentils.id, 500, 'g', '2027-01-05');
    const second = batch(lentils.id, 1, 'kg', '2027-03-01');

    expect(consumePantryProductStock(lentils.id, 0.75, 'kg', profileId)).toEqual([
      { batchId: first.id, quantity: 0.5, unit: 'kg' },
      { batchId: second.id, quantity: 0.25, unit: 'kg' },
    ]);
    const byId = new Map(getPantryDashboard().batches.map((item) => [item.id, item]));
    expect(byId.get(second.id)?.quantityRemaining).toBe(0.75);
    expect(
      getPantryDashboard({
        q: '',
        view: 'all',
        sort: 'expiry',
        includeInactive: true,
      }).batches.find((item) => item.id === first.id)?.status,
    ).toBe('depleted');
  });

  it('uses batch versions to reject stale writes and supports one-step undo', () => {
    const beans = product('Cannellini beans');
    const created = batch(beans.id, 3, 'each', '2027-02-01');
    const consumed = applyPantryBatchAction(
      created.id,
      { type: 'consume_one', expectedVersion: 1, note: '' },
      profileId,
    );
    expect(consumed).toMatchObject({ quantityRemaining: 2, version: 2 });

    const restored = applyPantryBatchAction(
      created.id,
      { type: 'undo', expectedVersion: 2, note: '' },
      profileId,
    );
    expect(restored).toMatchObject({ quantityRemaining: 3, version: 3 });
    expect(() =>
      applyPantryBatchAction(
        created.id,
        { type: 'mark_empty', expectedVersion: 1, note: '' },
        profileId,
      ),
    ).toThrow(PantryConflictError);
    expect(listPantryEvents(created.id).map((event) => event.eventType)).toContain('action_undone');
    expect(listPantryEvents(created.id).map((event) => event.batchSequence)).toEqual([3, 2, 1]);
  });

  it('restores product and source-link state when an edit is undone', () => {
    const beans = product('Black beans');
    const lentils = product('Green lentils');
    const sourceRecipeId = '00000000-0000-4000-8000-000000000111';
    const sourceMealPlanEntryId = '00000000-0000-4000-8000-000000000112';
    const sourceShoppingListId = '00000000-0000-4000-8000-000000000113';
    const sourceShoppingListItemId = '00000000-0000-4000-8000-000000000114';
    const now = new Date();
    getDatabase()
      .insert(recipes)
      .values({
        id: sourceRecipeId,
        title: 'Source recipe',
        summary: '',
        status: 'active',
        servings: '1',
        prepMinutes: 0,
        cookMinutes: 0,
        restMinutes: 0,
        difficulty: '',
        cuisine: '',
        category: '',
        tips: '',
        sharedNotes: '',
        createdByProfileId: profileId,
        lastEditedByProfileId: profileId,
        currentRevision: 1,
        createdAt: now,
        updatedAt: now,
      })
      .run();
    getDatabase()
      .insert(mealPlanEntries)
      .values({
        id: sourceMealPlanEntryId,
        plannedFor: '2027-02-01',
        meal: 'dinner',
        recipeId: sourceRecipeId,
        title: 'Source meal',
        servings: 1,
        note: '',
        createdByProfileId: profileId,
        updatedByProfileId: profileId,
        createdAt: now,
        updatedAt: now,
      })
      .run();
    getDatabase()
      .insert(shoppingLists)
      .values({
        id: sourceShoppingListId,
        name: 'Source list',
        weekStart: '2027-02-01',
        weekEnd: '2027-02-07',
        createdByProfileId: profileId,
        createdAt: now,
        updatedAt: now,
      })
      .run();
    getDatabase()
      .insert(shoppingListItems)
      .values({
        id: sourceShoppingListItemId,
        listId: sourceShoppingListId,
        position: 0,
        quantity: 3,
        unit: 'each',
        item: 'Black beans',
        note: '',
        checked: true,
        sourceRecipeIds: JSON.stringify([sourceRecipeId]),
        createdAt: now,
        updatedAt: now,
      })
      .run();
    const created = createPantryBatch(
      pantryBatchInputSchema.parse({
        productId: beans.id,
        quantityRemaining: 3,
        originalQuantity: 3,
        unit: 'each',
        locationId,
        useByDate: '2027-02-01',
        expiryPrecision: 'exact',
        sourceRecipeId,
        sourceMealPlanEntryId,
        sourceShoppingListItemId,
      }),
      profileId,
    );

    updatePantryBatch(
      created.id,
      pantryBatchUpdateSchema.parse({
        productId: lentils.id,
        quantityRemaining: 3,
        originalQuantity: 3,
        unit: 'each',
        locationId,
        useByDate: '2027-02-01',
        expiryPrecision: 'exact',
        expectedVersion: created.version,
      }),
      profileId,
    );
    const restored = applyPantryBatchAction(
      created.id,
      { type: 'undo', expectedVersion: 2, note: '' },
      profileId,
    );

    expect(restored).toMatchObject({
      productId: beans.id,
      sourceRecipeId,
      sourceMealPlanEntryId,
      sourceShoppingListItemId,
    });
  });

  it('uses effective opened expiry for FEFO deductions', () => {
    const yoghurt = createPantryProduct(
      pantryProductInputSchema.parse({
        displayName: 'Yoghurt',
        defaultInventoryUnit: 'g',
        defaultStorageType: 'refrigerator',
        shelfLifeAfterOpeningDays: 3,
      }),
      profileId,
    );
    const printedFirst = batch(yoghurt.id, 100, 'g', '2026-09-01');
    const openedFirst = createPantryBatch(
      pantryBatchInputSchema.parse({
        productId: yoghurt.id,
        quantityRemaining: 100,
        originalQuantity: 100,
        unit: 'g',
        locationId,
        useByDate: '2026-10-01',
        openedDate: '2026-08-01',
        status: 'opened',
        expiryPrecision: 'exact',
      }),
      profileId,
    );

    expect(consumePantryProductStock(yoghurt.id, 50, 'g', profileId)).toEqual([
      { batchId: openedFirst.id, quantity: 50, unit: 'g' },
    ]);
    expect(getPantryDashboard().batches.find((item) => item.id === printedFirst.id)).toMatchObject({
      quantityRemaining: 100,
    });
  });

  it('rolls back every FEFO deduction when one optimistic update misses', () => {
    const lentils = product();
    const first = batch(lentils.id, 500, 'g', '2027-01-05');
    const second = batch(lentils.id, 500, 'g', '2027-03-01');
    getDatabase().run(
      sql.raw(`
      CREATE TRIGGER pantry_test_block_update
      BEFORE UPDATE ON pantry_batches
      WHEN OLD.id = '${second.id}'
      BEGIN
        SELECT RAISE(IGNORE);
      END
    `),
    );

    expect(() => consumePantryProductStock(lentils.id, 750, 'g', profileId)).toThrow(
      PantryConflictError,
    );
    const byId = new Map(getPantryDashboard().batches.map((item) => [item.id, item]));
    expect(byId.get(first.id)?.quantityRemaining).toBe(500);
    expect(byId.get(second.id)?.quantityRemaining).toBe(500);
    expect(listPantryEvents()).toHaveLength(2);
  });

  it('enforces measurement and active-stock archive rules inside SQLite', () => {
    const rice = product('Brown rice');
    const created = batch(rice.id, 2, 'kg', '2027-04-01');

    expect(() =>
      getDatabase()
        .update(pantryBatches)
        .set({ approximateState: 'half' })
        .where(eq(pantryBatches.id, created.id))
        .run(),
    ).toThrow(/either exact or approximate/i);
    expect(() =>
      getDatabase()
        .update(pantryProducts)
        .set({ archivedAt: new Date() })
        .where(eq(pantryProducts.id, rice.id))
        .run(),
    ).toThrow(/active stock/i);
    expect(() =>
      updatePantryProduct(
        rice.id,
        pantryProductInputSchema.parse({
          displayName: rice.displayName,
          aliases: rice.aliases,
          defaultInventoryUnit: rice.defaultInventoryUnit,
          defaultStorageType: rice.defaultStorageType,
          archived: true,
        }),
        profileId,
      ),
    ).toThrow(PantryConflictError);
  });

  it('does not archive a location that still contains active stock', () => {
    const rice = product('Basmati rice');
    batch(rice.id, 2, 'kg', '2027-04-01');
    const location = listPantryLocations().find((candidate) => candidate.id === locationId)!;
    const update = pantryLocationInputSchema.parse({
      name: location.name,
      parentId: '',
      storageType: location.storageType,
      description: location.description,
      archived: true,
    });

    expect(() => updatePantryLocation(locationId, update, profileId)).toThrow(/Move active stock/i);
  });

  it('edits aliases, staple targets, detailed batches, and nested ordered locations', () => {
    const oats = product('Rolled oats');
    const edited = updatePantryProduct(
      oats.id,
      pantryProductInputSchema.parse({
        displayName: 'Jumbo rolled oats',
        brand: 'Mill House',
        variant: 'Organic',
        category: 'Breakfast',
        subcategory: 'Oats',
        aliases: ['porridge oats', 'oatmeal'],
        defaultInventoryUnit: 'g',
        defaultPackageAmount: 750,
        defaultPackageUnit: 'g',
        defaultStorageType: 'pantry',
        storageInstructions: 'Keep dry.',
        defaultShelfLifeDays: 365,
        shelfLifeAfterOpeningDays: 60,
        isStaple: true,
        preferredBrand: 'Mill House',
        preferredStore: 'Market',
        minimumStock: 250,
        targetStock: 1_000,
        reorderThreshold: 300,
        preferredPurchaseQuantity: 750,
        stockUnit: 'g',
        suggestGroceryRestock: true,
      }),
      profileId,
    );
    expect(edited).toMatchObject({
      aliases: ['oatmeal', 'porridge oats'],
      targetStock: 1_000,
      preferredPurchaseQuantity: 750,
    });

    const basement = createPantryLocation(
      pantryLocationInputSchema.parse({
        name: 'Basement shelf',
        parentId: '',
        storageType: 'pantry',
        description: '',
      }),
      profileId,
    );
    const nested = updatePantryLocation(
      basement.id,
      pantryLocationInputSchema.parse({
        name: 'Basement dry shelf',
        parentId: locationId,
        storageType: 'pantry',
        description: 'Cool and dark',
        position: 7,
      }),
      profileId,
    );
    expect(nested).toMatchObject({ path: 'Kitchen pantry / Basement dry shelf', position: 7 });

    const created = batch(oats.id, 750, 'g', '2027-09-01');
    const detailed = updatePantryBatch(
      created.id,
      pantryBatchUpdateSchema.parse({
        productId: oats.id,
        quantityRemaining: 700,
        originalQuantity: 750,
        unit: 'g',
        packageCount: 1,
        amountPerPackage: 750,
        packageUnit: 'g',
        locationId,
        sublocation: 'Upper shelf',
        purchaseDate: '2027-01-02',
        bestBeforeDate: '2027-09-01',
        useByDate: '',
        sellByDate: '2027-08-20',
        openedDate: '2027-02-01',
        frozenDate: '',
        thawedDate: '',
        preparedDate: '',
        expiryPrecision: 'estimated',
        status: 'opened',
        purchasePriceCents: 499,
        source: 'Market',
        notes: 'Paper bag',
        excludeFromGrocery: true,
        expectedVersion: created.version,
      }),
      profileId,
    );
    expect(detailed).toMatchObject({
      quantityRemaining: 700,
      packageCount: 1,
      sublocation: 'Upper shelf',
      sellByDate: '2027-08-20',
      expiryPrecision: 'estimated',
      purchasePriceCents: 499,
      excludeFromGrocery: true,
      version: 2,
    });
  });

  it('runs the full lifecycle with versions, actors, inactive views, and undo', () => {
    const berries = product('Frozen berries');
    const created = batch(berries.id, 4, 'each', '2027-08-01');
    const opened = applyPantryBatchAction(
      created.id,
      { type: 'open', expectedVersion: 1, openedDate: '2027-01-01', note: '' },
      profileId,
    );
    const frozen = applyPantryBatchAction(
      created.id,
      {
        type: 'freeze',
        expectedVersion: opened.version,
        frozenDate: '2027-01-02',
        locationId: '',
        note: '',
      },
      profileId,
    );
    const thawed = applyPantryBatchAction(
      created.id,
      { type: 'thaw', expectedVersion: frozen.version, thawedDate: '2027-01-03', note: '' },
      profileId,
    );
    const corrected = applyPantryBatchAction(
      created.id,
      {
        type: 'correct',
        expectedVersion: thawed.version,
        quantityRemaining: 3,
        unit: 'each',
        approximateState: null,
        reason: 'Counted',
        note: '',
      },
      profileId,
    );
    const discarded = applyPantryBatchAction(
      created.id,
      { type: 'discard', expectedVersion: corrected.version, reason: 'Damaged', note: '' },
      profileId,
    );
    expect(
      getPantryDashboard({
        q: '',
        view: 'discarded',
        sort: 'updated',
        includeInactive: true,
      }).batches.map((item) => item.id),
    ).toContain(created.id);
    const restored = applyPantryBatchAction(
      created.id,
      {
        type: 'restore',
        expectedVersion: discarded.version,
        quantityRemaining: 3,
        unit: 'each',
        approximateState: null,
        note: '',
      },
      profileId,
    );
    const donated = applyPantryBatchAction(
      created.id,
      { type: 'donate', expectedVersion: restored.version, reason: 'Community fridge', note: '' },
      profileId,
    );
    const undone = applyPantryBatchAction(
      created.id,
      { type: 'undo', expectedVersion: donated.version, note: '' },
      profileId,
    );
    expect(undone.status).toBe('opened');
    expect(listPantryEvents(created.id).every((event) => event.actorProfileId === profileId)).toBe(
      true,
    );
  });

  it('splits and combines compatible exact batches atomically and reversibly', () => {
    const flour = product('Bread flour');
    const source = batch(flour.id, 1_000, 'g', '2027-10-01');
    const splitSource = applyPantryBatchAction(
      source.id,
      {
        type: 'split',
        expectedVersion: source.version,
        quantity: 250,
        unit: 'g',
        locationId: '',
        note: 'Smaller jar',
      },
      profileId,
    );
    const afterSplit = getPantryDashboard({
      q: '',
      view: 'all',
      sort: 'added',
      includeInactive: true,
    }).batches.filter((item) => item.productId === flour.id);
    const child = afterSplit.find((item) => item.id !== source.id)!;
    expect(splitSource.quantityRemaining).toBe(750);
    expect(child.quantityRemaining).toBe(250);

    const restoredSource = applyPantryBatchAction(
      source.id,
      { type: 'undo', expectedVersion: splitSource.version, note: '' },
      profileId,
    );
    expect(restoredSource.quantityRemaining).toBe(1_000);
    expect(
      getPantryDashboard({ q: '', view: 'all', sort: 'added', includeInactive: true }).batches.find(
        (item) => item.id === child.id,
      ),
    ).toMatchObject({ quantityRemaining: 0, status: 'depleted', version: 2 });

    const second = batch(flour.id, 500, 'g', '2027-10-01');
    const combined = applyPantryBatchAction(
      source.id,
      {
        type: 'combine',
        expectedVersion: restoredSource.version,
        targetBatchId: second.id,
        targetExpectedVersion: second.version,
        note: '',
      },
      profileId,
    );
    expect(combined.quantityRemaining).toBe(1_500);
    const undoCombined = applyPantryBatchAction(
      source.id,
      { type: 'undo', expectedVersion: combined.version, note: '' },
      profileId,
    );
    expect(undoCombined.quantityRemaining).toBe(1_000);
    const restoredSecond = getPantryDashboard({
      q: '',
      view: 'all',
      sort: 'added',
      includeInactive: true,
    }).batches.find((item) => item.id === second.id);
    expect(restoredSecond).toMatchObject({
      quantityRemaining: 500,
      status: 'unopened',
      version: 3,
    });
  });
});
