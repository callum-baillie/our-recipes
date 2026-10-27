import { randomUUID } from 'node:crypto';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { eq } from 'drizzle-orm';
import { getDatabase, resetDatabaseForTests } from '@/lib/db/client';
import {
  cookSessions,
  mealPlanEntries,
  pantryBatches,
  pantryProductIdentifiers,
  pantryProducts,
  recipeIngredientGroups,
  recipeIngredientProductMappings,
  recipeIngredients,
  recipes,
  scannerOperations,
  scannerStations,
} from '@/lib/db/schema';
import { pantryBatchInputSchema, pantryProductInputSchema } from '@/lib/domain/pantry';
import { completeSetup } from '@/lib/services/household-service';
import {
  applyPantryBatchAction,
  createPantryBatch,
  createPantryProduct,
  ensureDefaultPantryLocations,
  listPantryLocations,
} from '@/lib/services/pantry-service';
import type { RequestPrincipal } from '@/lib/services/auth-service';
import type { BoundScannerOperation } from '@/lib/domain/scanner-station';
import {
  scannerContext,
  lookupScanner,
  executeBoundScannerOperation,
  syncScannerStation,
  createScannerControl,
  scannerStationDetail,
} from '@/lib/services/scanner-station-service';
import { createManualShoppingList, getShoppingList } from '@/lib/services/planning-service';
import { executeScannerOperation } from '@/lib/services/scanner-service';
import type { ScannerOperationInput } from '@/lib/domain/scanner';

describe('scanner operations on real SQLite stock', () => {
  let actor: { userId: string; profileId: string };
  let productId: string;
  let locationId: string;
  let batchId: string;
  const recipeId = '00000000-0000-4000-8000-000000000201';
  const groupId = '00000000-0000-4000-8000-000000000202';
  const ingredientId = '00000000-0000-4000-8000-000000000203';
  const barcode = '012345678905';
  const operation = (command: ScannerOperationInput['command']): ScannerOperationInput => ({
    operationId: randomUUID(),
    stationId: 'test-kitchen',
    command,
  });
  const cook = () => operation({ type: 'recipe', recipeId, expectedRevision: 1, servings: 2 });
  const stock = () =>
    getDatabase().select().from(pantryBatches).where(eq(pantryBatches.id, batchId)).get()!
      .quantityRemaining;

  beforeEach(() => {
    vi.stubEnv('DATABASE_URL', ':memory:');
    vi.stubEnv('DATA_DIR', './.test-data/scanner-service');
    resetDatabaseForTests();
    const profileId = completeSetup({
      householdName: 'Scanner test',
      appName: 'Bòrd',
      profile: {
        displayName: 'Tester',
        color: '#637A45',
        avatarUrl: '',
        units: 'metric',
        temperatureUnit: 'C',
        locale: 'en-US',
        timezone: 'America/Chicago',
      },
    }).profiles[0]!.id;
    actor = { userId: 'scanner-test-account', profileId };
    ensureDefaultPantryLocations(profileId);
    locationId = listPantryLocations().find((location) => location.storageType === 'pantry')!.id;
    productId = createPantryProduct(
      pantryProductInputSchema.parse({
        displayName: 'Test lentils',
        defaultInventoryUnit: 'g',
        defaultPackageAmount: 500,
        defaultPackageUnit: 'g',
      }),
      profileId,
    ).id;
    batchId = createPantryBatch(
      pantryBatchInputSchema.parse({
        productId,
        locationId,
        quantityRemaining: 1000,
        originalQuantity: 1000,
        unit: 'g',
      }),
      profileId,
    ).id;
    const now = new Date();
    getDatabase()
      .insert(pantryProductIdentifiers)
      .values({
        id: randomUUID(),
        productId,
        identifierType: 'upc_a',
        value: barcode,
        normalizedValue: barcode.padStart(14, '0'),
        verified: true,
        createdAt: now,
        updatedAt: now,
      })
      .run();
    getDatabase()
      .insert(recipes)
      .values({
        id: recipeId,
        title: 'Test lentil soup',
        summary: '',
        status: 'active',
        servings: '2',
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
      .insert(recipeIngredientGroups)
      .values({ id: groupId, recipeId, position: 0, name: '' })
      .run();
    getDatabase()
      .insert(recipeIngredients)
      .values({
        id: ingredientId,
        recipeId,
        groupId,
        position: 0,
        quantity: 200,
        unit: 'g',
        item: 'Test lentils',
        note: '',
      })
      .run();
    getDatabase()
      .insert(recipeIngredientProductMappings)
      .values({
        recipeIngredientId: ingredientId,
        productId,
        matchType: 'manual',
        compatibleVariant: true,
        isOptional: false,
        mappedByProfileId: profileId,
        createdAt: now,
        updatedAt: now,
      })
      .run();
  });
  afterEach(() => {
    resetDatabaseForTests();
    vi.unstubAllEnvs();
  });

  it('records made and deducts the card yield once, including lost-response retries', () => {
    const input = cook();
    input.command = { type: 'recipe', recipeId, expectedRevision: 1, servings: 4 };
    const result = executeScannerOperation(input, actor);
    expect(stock()).toBe(600);
    expect(result.message).toContain('4 servings');
    expect(executeScannerOperation(input, actor)).toMatchObject({
      operationId: input.operationId,
      replayed: true,
      cookSessionId: result.cookSessionId,
    });
    expect(stock()).toBe(600);
    expect(getDatabase().select().from(cookSessions).all()).toHaveLength(1);
  });
  it('undo restores ingredients and clears made status, and a retry does not undo twice', () => {
    const made = executeScannerOperation(cook(), actor);
    const undo = operation({ type: 'undo', targetOperationId: made.operationId });
    executeScannerOperation(undo, actor);
    expect(stock()).toBe(1000);
    expect(getDatabase().select().from(cookSessions).get()!.completedAt).toBeNull();
    expect(executeScannerOperation(undo, actor).replayed).toBe(true);
    expect(() => executeScannerOperation(operation(undo.command), actor)).toThrow(
      'already been undone',
    );
  });
  it('rolls back the entire cooking action on missing stock or stale cards', () => {
    getDatabase().update(pantryBatches).set({ quantityRemaining: 10 }).run();
    expect(() => executeScannerOperation(cook(), actor)).toThrow('review missing stock');
    expect(getDatabase().select().from(cookSessions).all()).toHaveLength(0);
    expect(getDatabase().select().from(scannerOperations).all()).toHaveLength(0);
    const stale = cook();
    stale.command = { type: 'recipe', recipeId, expectedRevision: 2, servings: 2 };
    expect(() => executeScannerOperation(stale, actor)).toThrow('recipe changed');
    expect(stock()).toBe(10);
  });
  it('rejects unknown ingredient mappings rather than silently skipping them', () => {
    getDatabase().delete(recipeIngredientProductMappings).run();
    expect(() => executeScannerOperation(cook(), actor)).toThrow('review missing stock');
    expect(stock()).toBe(1000);
  });
  it('adds packages using saved amounts and undo rejects stock changed afterward', () => {
    const result = executeScannerOperation(
      operation({ type: 'pantry_add', barcode, packages: 2, locationId }),
      actor,
    );
    expect(
      getDatabase().select().from(pantryBatches).where(eq(pantryBatches.id, result.batchId!)).get()!
        .quantityRemaining,
    ).toBe(1000);
    applyPantryBatchAction(
      result.batchId!,
      { type: 'open', expectedVersion: result.batchVersion!, note: '', openedDate: null },
      actor.profileId,
    );
    expect(() =>
      executeScannerOperation(
        operation({ type: 'undo', targetOperationId: result.operationId }),
        actor,
      ),
    ).toThrow();
    expect(getDatabase().select().from(scannerOperations).all()).toHaveLength(1);
  });
  it('removes the saved package amount and safely restores all affected batches', () => {
    const result = executeScannerOperation(
      operation({ type: 'pantry_remove', barcode, packages: 1 }),
      actor,
    );
    expect(stock()).toBe(500);
    executeScannerOperation(
      operation({ type: 'undo', targetOperationId: result.operationId }),
      actor,
    );
    expect(stock()).toBe(1000);
  });
  it('rejects changed intent, account or station on replay and undo', () => {
    const input = cook();
    const result = executeScannerOperation(input, actor);
    expect(() => executeScannerOperation(input, { ...actor, userId: 'other' })).toThrow(
      'different scan or account',
    );
    expect(() => executeScannerOperation({ ...input, stationId: 'other' }, actor)).toThrow(
      'different scan or account',
    );
    expect(() =>
      executeScannerOperation(
        {
          ...operation({ type: 'undo', targetOperationId: result.operationId }),
          stationId: 'other',
        },
        actor,
      ),
    ).toThrow('No matching action');
    expect(stock()).toBe(800);
  });
  it('leaves stock unchanged for unknown product barcodes', () => {
    expect(() =>
      executeScannerOperation(
        operation({ type: 'pantry_add', barcode: '4006381333931', packages: 1 }),
        actor,
      ),
    ).toThrow('save this barcode');
    expect(stock()).toBe(1000);
  });

  it('never uses unverified identifiers or guesses a missing package size', () => {
    const add = operation({ type: 'pantry_add', barcode, packages: 1, locationId });
    getDatabase().update(pantryProductIdentifiers).set({ verified: false }).run();
    expect(() => executeScannerOperation(add, actor)).toThrow('save this barcode');
    getDatabase().update(pantryProductIdentifiers).set({ verified: true }).run();
    getDatabase().update(pantryProducts).set({ defaultPackageAmount: null }).run();
    expect(() => executeScannerOperation(add, actor)).toThrow('package amount and unit');
    expect(stock()).toBe(1000);
  });

  it('uses saved package counts for count-based products, such as a carton of 12 eggs', () => {
    getDatabase()
      .update(pantryProducts)
      .set({ defaultInventoryUnit: 'each', defaultPackageAmount: 12, defaultPackageUnit: 'each' })
      .run();
    const result = executeScannerOperation(
      operation({ type: 'pantry_add', barcode, packages: 2, locationId }),
      actor,
    );
    expect(
      getDatabase().select().from(pantryBatches).where(eq(pantryBatches.id, result.batchId!)).get()!
        .quantityRemaining,
    ).toBe(24);
  });

  it('a subsequent stock change blocks cooking undo without clearing its made status', () => {
    const made = executeScannerOperation(cook(), actor);
    const batch = getDatabase()
      .select()
      .from(pantryBatches)
      .where(eq(pantryBatches.id, batchId))
      .get()!;
    applyPantryBatchAction(
      batchId,
      {
        type: 'consume',
        quantity: 1,
        unit: 'g',
        reason: 'Another user',
        expectedVersion: batch.version,
        note: '',
      },
      actor.profileId,
    );
    expect(() =>
      executeScannerOperation(
        operation({ type: 'undo', targetOperationId: made.operationId }),
        actor,
      ),
    ).toThrow('stock changed');
    expect(stock()).toBe(799);
    expect(getDatabase().select().from(cookSessions).get()!.completedAt).not.toBeNull();
  });

  it('links a planned meal once and allows a fresh scan only after its cooking was undone', () => {
    const mealId = randomUUID();
    const now = new Date();
    getDatabase()
      .insert(mealPlanEntries)
      .values({
        id: mealId,
        plannedFor: '2026-10-26',
        meal: 'dinner',
        recipeId,
        recipeRevision: 1,
        title: '',
        servings: 2,
        note: '',
        createdByProfileId: actor.profileId,
        updatedByProfileId: actor.profileId,
        createdAt: now,
        updatedAt: now,
      })
      .run();
    const command = {
      type: 'recipe' as const,
      recipeId,
      expectedRevision: 1,
      servings: 2,
      mealPlanEntryId: mealId,
    };
    const made = executeScannerOperation(operation(command), actor);
    expect(() => executeScannerOperation(operation(command), actor)).toThrow(
      'already marked as made',
    );
    expect(stock()).toBe(800);
    executeScannerOperation(
      operation({ type: 'undo', targetOperationId: made.operationId }),
      actor,
    );
    executeScannerOperation(operation(command), actor);
    expect(stock()).toBe(800);
  });
  function principal(): RequestPrincipal {
    return {
      kind: 'session',
      ...actor,
      role: 'admin',
      accountRole: 'admin',
      activeProfileRole: 'admin',
      sessionId: 'test',
      apiKeyId: null,
      linkedProfileId: actor.profileId,
    };
  }
  function binding() {
    getDatabase()
      .insert(scannerStations)
      .values({
        id: 'test-kitchen',
        name: 'Kitchen',
        bindingId: randomUUID(),
        apiKeyId: 'station-key',
        ...actor,
        createdAt: new Date(),
      })
      .run();
    return scannerContext(principal(), 'test-kitchen');
  }
  function bound(
    context: ReturnType<typeof binding>,
    command: BoundScannerOperation['command'],
    prepared?: BoundScannerOperation['prepared'],
  ): BoundScannerOperation {
    return {
      contractVersion: 2,
      operationId: randomUUID(),
      stationId: context.stationId,
      instanceId: context.instanceId,
      bindingId: context.bindingId,
      command,
      ...(prepared ? { prepared } : {}),
    };
  }
  it('replays a bound package operation after product edits without repeating stock', async () => {
    const context = binding(),
      lookup = await lookupScanner(principal(), {
        stationId: context.stationId,
        barcode,
        locationId,
      });
    if (lookup.kind !== 'local' || !lookup.prepared) throw Error('fixture');
    const input = bound(
      context,
      { type: 'pantry_add', barcode, packages: 2, locationId },
      lookup.prepared,
    );
    const first = executeBoundScannerOperation(principal(), input);
    expect(first.status).toBe(200);
    expect(first.result).toMatchObject({
      quantity: 1000,
      unit: 'g',
      outcome: 'succeeded',
      productName: 'Test lentils',
    });
    getDatabase()
      .update(pantryProducts)
      .set({ defaultPackageAmount: 750 })
      .where(eq(pantryProducts.id, productId))
      .run();
    expect(executeBoundScannerOperation(principal(), input).result).toMatchObject({
      ...first.result,
      replayed: true,
    });
    expect(
      getDatabase()
        .select()
        .from(pantryBatches)
        .all()
        .reduce((n, b) => n + (b.quantityRemaining ?? 0), 0),
    ).toBe(2000);
    expect(() =>
      executeBoundScannerOperation(principal(), {
        ...input,
        command: { ...input.command, packages: 3 },
      }),
    ).toThrow('another frozen');
  });
  it('keeps rejected package receipts terminal and permits one explicit correction', async () => {
    const context = binding(),
      lookup = await lookupScanner(principal(), {
        stationId: context.stationId,
        barcode,
        locationId,
      });
    if (lookup.kind !== 'local' || !lookup.prepared) throw Error('fixture');
    const input = bound(context, { type: 'pantry_remove', barcode, packages: 3 }, lookup.prepared);
    const rejected = executeBoundScannerOperation(principal(), input);
    expect(rejected.result.outcome).toBe('needs_review');
    expect(stock()).toBe(1000);
    expect(executeBoundScannerOperation(principal(), input).result.replayed).toBe(true);
    const corrected = {
      ...bound(context, { type: 'pantry_remove', barcode, packages: 1 }, lookup.prepared),
      supersedesOperationId: input.operationId,
    };
    expect(executeBoundScannerOperation(principal(), corrected).status).toBe(200);
    expect(stock()).toBe(500);
    expect(() =>
      executeBoundScannerOperation(principal(), { ...corrected, operationId: randomUUID() }),
    ).toThrow('already has');
  });
  it('rejects stale defaults, cross-station actor/binding and insufficient key scopes', async () => {
    const context = binding(),
      lookup = await lookupScanner(principal(), {
        stationId: context.stationId,
        barcode,
        locationId,
      });
    if (lookup.kind !== 'local' || !lookup.prepared) throw Error('fixture');
    const input = bound(
      context,
      { type: 'pantry_add', barcode, packages: 1, locationId },
      lookup.prepared,
    );
    expect(() => executeBoundScannerOperation({ ...principal(), userId: 'other' }, input)).toThrow(
      'registered',
    );
    expect(() =>
      executeBoundScannerOperation(principal(), { ...input, bindingId: randomUUID() }),
    ).toThrow('different station');
    expect(() =>
      executeBoundScannerOperation(
        {
          ...principal(),
          kind: 'api-key',
          apiKeyId: 'station-key',
          apiPermissions: { pantry: ['read'] },
        },
        input,
      ),
    ).toThrow('pantry:create');
    getDatabase()
      .update(pantryProducts)
      .set({ defaultPackageAmount: 750 })
      .where(eq(pantryProducts.id, productId))
      .run();
    expect(executeBoundScannerOperation(principal(), input).result.error?.code).toBe(
      'scanner_defaults_changed',
    );
    expect(stock()).toBe(1000);
  });
  it('guards batch counts and undo against intervening revisions', () => {
    const context = binding();
    const count = bound(context, {
      type: 'stocktake',
      counts: [{ batchId, expectedVersion: 1, quantityRemaining: 800, unit: 'g' }],
    });
    expect(executeBoundScannerOperation(principal(), count).status).toBe(200);
    expect(stock()).toBe(800);
    const stale = executeBoundScannerOperation(
      principal(),
      bound(context, {
        type: 'stocktake',
        counts: [{ batchId, expectedVersion: 1, quantityRemaining: 700, unit: 'g' }],
      }),
    );
    expect(stale.result.outcome).toBe('needs_review');
    expect(stock()).toBe(800);
    const undo = bound(context, { type: 'undo', targetOperationId: count.operationId });
    expect(executeBoundScannerOperation(principal(), undo).status).toBe(200);
    expect(stock()).toBe(1000);
    expect(executeBoundScannerOperation(principal(), undo).result.replayed).toBe(true);
  });
  it('makes cooking and linked leftovers once, and blocks undo that would orphan leftovers', () => {
    const context = binding(),
      made = executeBoundScannerOperation(
        principal(),
        bound(context, { type: 'recipe', recipeId, expectedRevision: 1, servings: 2 }),
      );
    expect(made.status).toBe(200);
    expect(stock()).toBe(800);
    const input = bound(context, {
      type: 'leftover',
      cookSessionId: made.result.cookSessionId!,
      productId,
      locationId,
      quantity: 150,
      unit: 'g',
    });
    expect(executeBoundScannerOperation(principal(), input).status).toBe(200);
    expect(executeBoundScannerOperation(principal(), input).result.replayed).toBe(true);
    expect(stock()).toBe(800);
    const undo = executeBoundScannerOperation(
      principal(),
      bound(context, { type: 'undo', targetOperationId: made.result.operationId }),
    );
    expect(undo.result.outcome).toBe('needs_review');
    expect(stock()).toBe(800);
  });
  it('adds shopping demand without stock and intakes an exact purchased amount once', () => {
    const context = binding(),
      list = createManualShoppingList('Groceries', actor.profileId);
    const add = bound(context, {
      type: 'shopping_add',
      listId: list.id,
      productId,
      quantity: 500,
      unit: 'g',
    });
    const added = executeBoundScannerOperation(principal(), add);
    expect(added.status).toBe(200);
    expect(stock()).toBe(1000);
    expect(executeBoundScannerOperation(principal(), add).result.replayed).toBe(true);
    const item = getShoppingList(list.id)!.items[0]!;
    const intake = bound(context, {
      type: 'shopping_intake',
      listId: list.id,
      itemId: item.id,
      expectedUpdatedAt: item.updatedAt.toISOString(),
      productId,
      locationId,
      quantity: 500,
      unit: 'g',
      complete: true,
    });
    const saved = executeBoundScannerOperation(principal(), intake);
    expect(saved.status).toBe(200);
    expect(executeBoundScannerOperation(principal(), intake).result.replayed).toBe(true);
    expect(
      getDatabase()
        .select()
        .from(pantryBatches)
        .all()
        .reduce((n, b) => n + (b.quantityRemaining ?? 0), 0),
    ).toBe(1500);
  });
  it('acknowledges telemetry once across restarts and guards remote controls by boot and revision', () => {
    const context = binding(),
      bootId = randomUUID();
    const state = {
      bootId,
      revision: 1,
      mode: 'idle' as const,
      packages: 1,
      locationId: null,
      action: null,
      expiresAt: null,
      readerConnected: true,
      queueCount: 0,
      reviewCount: 0,
    };
    const event = {
      bootId: randomUUID(),
      sequence: 1,
      operationId: null,
      status: 'info' as const,
      message: 'Retained before restart',
      time: Date.now() / 1000,
    };
    const sync = {
      instanceId: context.instanceId,
      bindingId: context.bindingId,
      state,
      events: [event],
      acknowledgements: [],
    };
    expect(syncScannerStation(principal(), context.stationId, sync).acknowledgedSequences).toEqual([
      1,
    ]);
    syncScannerStation(principal(), context.stationId, sync);
    expect(scannerStationDetail(principal(), context.stationId).events).toHaveLength(1);
    const control = {
      id: randomUUID(),
      bootId,
      stateRevision: 1,
      command: { control: 'mode' as const, mode: 'add' as const },
    };
    createScannerControl(principal(), context.stationId, control);
    expect(
      syncScannerStation(principal(), context.stationId, { ...sync, events: [] }).controls,
    ).toHaveLength(1);
    const restarted = {
      ...sync,
      state: { ...state, bootId: randomUUID(), revision: 0 },
      events: [],
    };
    expect(syncScannerStation(principal(), context.stationId, restarted).controls).toHaveLength(0);
    expect(() =>
      createScannerControl(principal(), context.stationId, { ...control, id: randomUUID() }),
    ).toThrow('changed or disconnected');
  });
  it('rolls back every counted batch when one baseline is stale', () => {
    const context = binding();
    const second = createPantryBatch(
      pantryBatchInputSchema.parse({
        productId,
        locationId,
        quantityRemaining: 200,
        originalQuantity: 200,
        unit: 'g',
      }),
      actor.profileId,
    );
    const input = bound(context, {
      type: 'stocktake',
      counts: [
        { batchId, expectedVersion: 1, quantityRemaining: 600, unit: 'g' },
        { batchId: second.id, expectedVersion: 999, quantityRemaining: 100, unit: 'g' },
      ],
    });
    expect(executeBoundScannerOperation(principal(), input).result.outcome).toBe('needs_review');
    expect(stock()).toBe(1000);
    expect(
      getDatabase().select().from(pantryBatches).where(eq(pantryBatches.id, second.id)).get()
        ?.quantityRemaining,
    ).toBe(200);
  });
  it('prevents a late original from applying after an unsubmitted capture was corrected', async () => {
    const context = binding(),
      lookup = await lookupScanner(principal(), {
        stationId: context.stationId,
        barcode,
        locationId,
      });
    if (lookup.kind !== 'local' || !lookup.prepared) throw Error('fixture');
    const original = bound(
      context,
      { type: 'pantry_add', barcode, packages: 1, locationId },
      lookup.prepared,
    );
    syncScannerStation(principal(), context.stationId, {
      instanceId: context.instanceId,
      bindingId: context.bindingId,
      state: {
        bootId: randomUUID(),
        revision: 0,
        mode: 'idle',
        packages: 1,
        locationId: null,
        action: null,
        expiresAt: null,
        readerConnected: true,
        queueCount: 0,
        reviewCount: 1,
      },
      events: [
        {
          sequence: 1,
          operationId: original.operationId,
          status: 'review',
          message: 'Not submitted',
          time: Date.now() / 1000,
          command: original.command,
          submission: 'not_submitted',
        },
      ],
      acknowledgements: [],
    });
    const correction = {
      ...original,
      operationId: randomUUID(),
      supersedesOperationId: original.operationId,
    };
    expect(executeBoundScannerOperation(principal(), correction).status).toBe(200);
    expect(executeBoundScannerOperation(principal(), original).result.error?.code).toBe(
      'scanner_original_superseded',
    );
    expect(executeBoundScannerOperation(principal(), original).result.replayed).toBe(true);
    expect(
      getDatabase()
        .select()
        .from(pantryBatches)
        .all()
        .reduce((n, b) => n + (b.quantityRemaining ?? 0), 0),
    ).toBe(1500);
  });
});
