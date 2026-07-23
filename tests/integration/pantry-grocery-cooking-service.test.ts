import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { sql } from 'drizzle-orm';

import { getDatabase, resetDatabaseForTests } from '@/lib/db/client';
import {
  cookSessions,
  mealPlanEntries,
  pantryBatches,
  pantryCookSessionDeductions,
  pantryCookSessionLeftovers,
  pantryCookSessionPlans,
  pantryInventoryEvents,
  pantryPurchaseIntakes,
  pantryProducts,
  pantryShoppingItemDetails,
  recipeIngredientGroups,
  recipeIngredientProductMappings,
  recipeIngredients,
  recipes,
  shoppingListItems,
  shoppingLists,
} from '@/lib/db/schema';
import { pantryBatchInputSchema, pantryProductInputSchema } from '@/lib/domain/pantry';
import { completeSetup } from '@/lib/services/household-service';
import {
  confirmCookSessionWithPantry,
  generatePantryShortageList,
  getCookSessionPantryPreview,
  intakePurchasedShoppingItem,
  updateShoppingItemPantryControl,
  undoCookSessionPantry,
} from '@/lib/services/pantry-grocery-cooking-service';
import {
  createPantryBatch,
  createPantryProduct,
  ensureDefaultPantryLocations,
  getPantryDashboard,
  listPantryEvents,
  listPantryLocations,
  applyPantryBatchAction,
  previewPantryProductConsumption,
} from '@/lib/services/pantry-service';
import { getShoppingList, updateShoppingListItem } from '@/lib/services/planning-service';
import { startCookSession } from '@/lib/services/cooking-service';

describe('Pantry grocery and cooking service', () => {
  let profileId: string;
  let locationId: string;
  let productId: string;
  const recipeId = '00000000-0000-4000-8000-000000000101';
  const groupId = '00000000-0000-4000-8000-000000000102';
  const ingredientId = '00000000-0000-4000-8000-000000000103';
  const mealId = '00000000-0000-4000-8000-000000000104';

  beforeEach(() => {
    vi.stubEnv('DATABASE_URL', ':memory:');
    vi.stubEnv('DATA_DIR', './.test-data/pantry-grocery-cooking');
    resetDatabaseForTests();
    profileId = completeSetup({
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
    ensureDefaultPantryLocations(profileId);
    locationId = listPantryLocations()[0]!.id;
    productId = createPantryProduct(
      pantryProductInputSchema.parse({
        displayName: 'Red lentils',
        defaultInventoryUnit: 'g',
        defaultStorageType: 'pantry',
      }),
      profileId,
    ).id;
    const now = new Date();
    getDatabase()
      .insert(recipes)
      .values({
        id: recipeId,
        title: 'Lentil soup',
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
        item: 'red lentils',
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
    getDatabase()
      .insert(mealPlanEntries)
      .values({
        id: mealId,
        plannedFor: '2027-04-03',
        meal: 'dinner',
        recipeId,
        title: '',
        servings: 2,
        note: '',
        createdByProfileId: profileId,
        updatedByProfileId: profileId,
        createdAt: now,
        updatedAt: now,
      })
      .run();
  });

  afterEach(() => {
    resetDatabaseForTests();
    vi.unstubAllEnvs();
  });

  it('generates definitive shortages and preserves manual overrides on regeneration', () => {
    createPantryBatch(
      pantryBatchInputSchema.parse({
        productId,
        quantityRemaining: 50,
        originalQuantity: 50,
        unit: 'g',
        locationId,
        expiryPrecision: 'unknown',
      }),
      profileId,
    );
    const generated = generatePantryShortageList(
      { weekStart: '2027-04-01', weekEnd: '2027-04-07' },
      profileId,
    );
    const first = getShoppingList(generated.listId)!.items[0]!;
    expect(first).toMatchObject({ quantity: 150, unit: 'g', pantry: { demandState: 'shortage' } });
    expect(JSON.parse(first.sourceRecipeIds)).toEqual([recipeId]);
    const formula = JSON.parse(first.pantry!.formulaInputs) as {
      contributions: Array<Record<string, unknown>>;
    };
    expect(formula.contributions).toEqual([
      expect.objectContaining({
        mealPlanEntryId: mealId,
        plannedFor: '2027-04-03',
        recipeId,
        recipeTitle: 'Lentil soup',
        servings: 2,
        baseServings: 2,
        ingredientId,
        ingredientName: 'red lentils',
        requiredQuantity: 200,
        contributionQuantity: 200,
        contributionUnit: 'g',
      }),
    ]);
    updateShoppingListItem(generated.listId, first.id, {
      quantity: 180,
      unit: 'g',
      item: first.item,
      note: 'Buy a larger bag',
      aisleId: '',
      checked: false,
    });
    generatePantryShortageList(
      { weekStart: '2027-04-01', weekEnd: '2027-04-07', listId: generated.listId },
      profileId,
    );
    expect(getShoppingList(generated.listId)!.items[0]).toMatchObject({
      quantity: 180,
      note: 'Buy a larger bag',
      pantry: { manualQuantityOverride: true, manualNoteOverride: true },
    });
    getDatabase()
      .delete(mealPlanEntries)
      .where(sql`${mealPlanEntries.id} = ${mealId}`)
      .run();
    generatePantryShortageList(
      { weekStart: '2027-04-01', weekEnd: '2027-04-07', listId: generated.listId },
      profileId,
    );
    expect(getShoppingList(generated.listId)!.items[0]).toMatchObject({
      quantity: 180,
      note: 'Buy a larger bag',
      pantry: { demandState: 'manual' },
    });
  });

  it('persists null uncertain shortages with complete meal and formula provenance', () => {
    createPantryBatch(
      pantryBatchInputSchema.parse({
        productId,
        quantityRemaining: null,
        approximateState: 'half',
        unit: 'g',
        locationId,
        expiryPrecision: 'unknown',
      }),
      profileId,
    );
    const generated = generatePantryShortageList(
      { weekStart: '2027-04-01', weekEnd: '2027-04-07' },
      profileId,
    );
    const item = getShoppingList(generated.listId)!.items[0]!;
    expect(item).toMatchObject({
      quantity: null,
      pantry: { demandState: 'uncertain', generatedQuantity: null, shortageQuantity: null },
    });
    expect(JSON.parse(item.sourceRecipeIds)).toEqual([recipeId]);
    expect(JSON.parse(item.pantry!.provenance)).toMatchObject({
      generatedFrom: 'projected-pantry-demand-v1',
      contributions: [
        {
          mealPlanEntryId: mealId,
          plannedFor: '2027-04-03',
          recipeId,
          servings: 2,
          contributionQuantity: 200,
        },
      ],
    });
  });

  it('uses max recipe-or-staple plus extra without double-counting stock or purchases', () => {
    getDatabase()
      .update(pantryProducts)
      .set({
        isStaple: true,
        suggestGroceryRestock: true,
        reorderThreshold: 300,
        targetStock: 500,
        stockUnit: 'g',
      })
      .where(sql`${pantryProducts.id} = ${productId}`)
      .run();
    createPantryBatch(
      pantryBatchInputSchema.parse({
        productId,
        quantityRemaining: 100,
        originalQuantity: 100,
        unit: 'g',
        locationId,
        expiryPrecision: 'unknown',
      }),
      profileId,
    );
    createPantryBatch(
      pantryBatchInputSchema.parse({
        productId,
        quantityRemaining: 1_000,
        originalQuantity: 1_000,
        unit: 'g',
        locationId,
        excludeFromGrocery: true,
        expiryPrecision: 'unknown',
      }),
      profileId,
    );
    const generated = generatePantryShortageList(
      { weekStart: '2027-04-01', weekEnd: '2027-04-07', mode: 'all' },
      profileId,
    );
    let item = getShoppingList(generated.listId)!.items[0]!;
    expect(item.quantity).toBe(400);
    expect(JSON.parse(item.pantry!.formulaInputs)).toMatchObject({
      recipeRequirement: 200,
      stapleTarget: 500,
      manualExtra: 0,
      usablePantry: 100,
      purchased: 0,
      shortageQuantity: 400,
    });

    updateShoppingItemPantryControl(
      generated.listId,
      item.id,
      { action: 'extra', quantity: 50, unit: 'g' },
      profileId,
    );
    generatePantryShortageList(
      {
        weekStart: '2027-04-01',
        weekEnd: '2027-04-07',
        listId: generated.listId,
        mode: 'all',
      },
      profileId,
    );
    item = getShoppingList(generated.listId)!.items[0]!;
    expect(item.quantity).toBe(450);

    const intake = {
      operationKey: 'formula-intake-1',
      productId,
      locationId,
      quantity: 100,
      unit: 'g',
      intakeMode: 'partial' as const,
      packageCount: 2,
      amountPerPackage: 50,
      packageUnit: 'g',
      sublocation: 'Top shelf',
      purchaseDate: '2027-04-01',
      bestBeforeDate: '2027-06-01',
      useByDate: '2027-05-20',
      sellByDate: '2027-05-10',
      expiryPrecision: 'exact' as const,
      purchasePriceCents: 499,
      store: 'Market',
      source: 'shopping-list-purchase',
      notes: 'Two bags',
    };
    const first = intakePurchasedShoppingItem(generated.listId, item.id, intake, profileId);
    expect(intakePurchasedShoppingItem(generated.listId, item.id, intake, profileId)).toEqual({
      batchId: first.batchId,
      replayed: true,
    });
    generatePantryShortageList(
      {
        weekStart: '2027-04-01',
        weekEnd: '2027-04-07',
        listId: generated.listId,
        mode: 'all',
      },
      profileId,
    );
    item = getShoppingList(generated.listId)!.items[0]!;
    expect(item.quantity).toBe(350);
    expect(JSON.parse(item.pantry!.formulaInputs)).toMatchObject({
      usablePantry: 100,
      purchased: 100,
      shortageQuantity: 350,
    });
    expect(
      getDatabase()
        .select()
        .from(pantryBatches)
        .all()
        .find((row) => row.id === first.batchId),
    ).toMatchObject({
      packageCount: 2,
      amountPerPackage: 50,
      packageUnit: 'g',
      sublocation: 'Top shelf',
      purchaseDate: '2027-04-01',
      bestBeforeDate: '2027-06-01',
      useByDate: '2027-05-20',
      sellByDate: '2027-05-10',
      expiryPrecision: 'exact',
      purchasePriceCents: 499,
      source: 'Market',
      notes: 'Two bags',
      createdByProfileId: profileId,
    });

    updateShoppingItemPantryControl(generated.listId, item.id, { action: 'ignore' }, profileId);
    generatePantryShortageList(
      {
        weekStart: '2027-04-01',
        weekEnd: '2027-04-07',
        listId: generated.listId,
        mode: 'all',
      },
      profileId,
    );
    item = getShoppingList(generated.listId)!.items[0]!;
    expect(item.quantity).toBe(450);
    expect(JSON.parse(item.pantry!.formulaInputs).usablePantry).toBe(0);

    updateShoppingItemPantryControl(
      generated.listId,
      item.id,
      { action: 'inaccurate', note: 'Shelf count is stale' },
      profileId,
    );
    generatePantryShortageList(
      {
        weekStart: '2027-04-01',
        weekEnd: '2027-04-07',
        listId: generated.listId,
        mode: 'all',
      },
      profileId,
    );
    expect(getShoppingList(generated.listId)!.items[0]).toMatchObject({
      quantity: null,
      pantry: { demandState: 'uncertain', uncertaintyReason: 'Shelf count is stale' },
    });
  });

  it('retains covered rows durably while missing-only views omit them', () => {
    const generated = generatePantryShortageList(
      { weekStart: '2027-04-01', weekEnd: '2027-04-07', mode: 'all' },
      profileId,
    );
    const item = getShoppingList(generated.listId)!.items[0]!;
    updateShoppingItemPantryControl(generated.listId, item.id, { action: 'covered' }, profileId);
    generatePantryShortageList(
      {
        weekStart: '2027-04-01',
        weekEnd: '2027-04-07',
        listId: generated.listId,
        mode: 'missing',
      },
      profileId,
    );
    expect(getShoppingList(generated.listId)!.items).toHaveLength(0);
    expect(getDatabase().select().from(pantryShoppingItemDetails).all()[0]).toMatchObject({
      coverageState: 'covered',
      demandState: 'shortage',
      generationMode: 'missing',
    });
    generatePantryShortageList(
      {
        weekStart: '2027-04-01',
        weekEnd: '2027-04-07',
        listId: generated.listId,
        mode: 'all',
      },
      profileId,
    );
    expect(getShoppingList(generated.listId)!.items[0]).toMatchObject({
      quantity: 0,
      pantry: { coverageState: 'covered', demandState: 'shortage' },
    });
  });

  it('persists multi-recipe contributions then clears every generated claim on obsolete manual rows', () => {
    const secondRecipeId = '00000000-0000-4000-8000-000000000120';
    const secondGroupId = '00000000-0000-4000-8000-000000000121';
    const secondIngredientId = '00000000-0000-4000-8000-000000000122';
    const secondMealId = '00000000-0000-4000-8000-000000000123';
    const now = new Date();
    getDatabase()
      .insert(recipes)
      .values({
        id: secondRecipeId,
        title: 'Lentil bake',
        summary: '',
        status: 'active',
        servings: '4',
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
      .values({ id: secondGroupId, recipeId: secondRecipeId, position: 0, name: '' })
      .run();
    getDatabase()
      .insert(recipeIngredients)
      .values({
        id: secondIngredientId,
        recipeId: secondRecipeId,
        groupId: secondGroupId,
        position: 0,
        quantity: 1_000,
        unit: 'g',
        item: 'red lentils',
        note: '',
      })
      .run();
    getDatabase()
      .insert(recipeIngredientProductMappings)
      .values({
        recipeIngredientId: secondIngredientId,
        productId,
        matchType: 'manual',
        compatibleVariant: true,
        isOptional: false,
        mappedByProfileId: profileId,
        createdAt: now,
        updatedAt: now,
      })
      .run();
    getDatabase()
      .insert(mealPlanEntries)
      .values({
        id: secondMealId,
        plannedFor: '2027-04-05',
        meal: 'dinner',
        recipeId: secondRecipeId,
        title: '',
        servings: 2,
        note: '',
        createdByProfileId: profileId,
        updatedByProfileId: profileId,
        createdAt: now,
        updatedAt: now,
      })
      .run();

    const generated = generatePantryShortageList(
      { weekStart: '2027-04-01', weekEnd: '2027-04-07' },
      profileId,
    );
    const item = getShoppingList(generated.listId)!.items[0]!;
    expect((JSON.parse(item.sourceRecipeIds) as string[]).sort()).toEqual(
      [recipeId, secondRecipeId].sort(),
    );
    const provenance = JSON.parse(item.pantry!.provenance) as {
      contributions: Array<{ recipeId: string; servings: number; contributionQuantity: number }>;
    };
    expect(provenance.contributions).toHaveLength(2);
    expect(provenance.contributions).toEqual(
      expect.arrayContaining([
        expect.objectContaining({ recipeId, servings: 2, contributionQuantity: 200 }),
        expect.objectContaining({
          recipeId: secondRecipeId,
          servings: 2,
          contributionQuantity: 500,
        }),
      ]),
    );

    updateShoppingListItem(generated.listId, item.id, {
      quantity: 750,
      unit: 'g',
      item: 'Lentils for later',
      note: 'Keep this manual purchase',
      aisleId: '',
      checked: false,
    });
    getDatabase().delete(mealPlanEntries).run();
    generatePantryShortageList(
      { weekStart: '2027-04-01', weekEnd: '2027-04-07', listId: generated.listId },
      profileId,
    );
    expect(getShoppingList(generated.listId)!.items[0]).toMatchObject({
      quantity: 750,
      unit: 'g',
      item: 'Lentils for later',
      note: 'Keep this manual purchase',
      sourceRecipeIds: '[]',
      pantry: {
        demandState: 'manual',
        generatedQuantity: null,
        generatedUnit: '',
        shortageQuantity: null,
        uncertaintyReason: null,
        formulaInputs: '{}',
        provenance: '{}',
      },
    });
  });

  it('rolls back a shopping edit when its override flags cannot be recorded', () => {
    const generated = generatePantryShortageList(
      { weekStart: '2027-04-01', weekEnd: '2027-04-07' },
      profileId,
    );
    const item = getShoppingList(generated.listId)!.items[0]!;
    getDatabase().run(
      sql.raw(`CREATE TRIGGER pantry_test_block_override
        BEFORE UPDATE ON pantry_shopping_item_details
        BEGIN SELECT RAISE(ABORT, 'blocked override'); END`),
    );
    expect(() =>
      updateShoppingListItem(generated.listId, item.id, {
        quantity: 999,
        unit: 'g',
        item: item.item,
        note: item.note,
        aisleId: '',
        checked: false,
      }),
    ).toThrow('blocked override');
    expect(getShoppingList(generated.listId)!.items[0]).toMatchObject({
      quantity: item.quantity,
      pantry: { manualQuantityOverride: false },
    });
  });

  it('replays one intake operation but permits a later distinct intake', () => {
    const now = new Date();
    const listId = '00000000-0000-4000-8000-000000000110';
    const itemId = '00000000-0000-4000-8000-000000000111';
    getDatabase()
      .insert(shoppingLists)
      .values({
        id: listId,
        name: 'Groceries',
        weekStart: '2027-04-01',
        weekEnd: '2027-04-07',
        createdByProfileId: profileId,
        createdAt: now,
        updatedAt: now,
      })
      .run();
    getDatabase()
      .insert(shoppingListItems)
      .values({
        id: itemId,
        listId,
        position: 0,
        quantity: 500,
        unit: 'g',
        item: 'Lentils',
        note: '',
        aisleId: null,
        checked: true,
        sourceRecipeIds: '[]',
        createdAt: now,
        updatedAt: now,
      })
      .run();
    const input = {
      operationKey: 'purchase-lentils-1',
      productId,
      locationId,
      quantity: 500,
      unit: 'g',
      notes: '',
    };
    const first = intakePurchasedShoppingItem(listId, itemId, input, profileId);
    const replay = intakePurchasedShoppingItem(listId, itemId, input, profileId);
    expect(replay).toEqual({ batchId: first.batchId, replayed: true });
    const later = intakePurchasedShoppingItem(
      listId,
      itemId,
      { ...input, operationKey: 'purchase-lentils-2' },
      profileId,
    );
    expect(later.replayed).toBe(false);
    expect(getDatabase().select().from(pantryPurchaseIntakes).all()).toHaveLength(2);
    expect(getPantryDashboard().batches).toHaveLength(2);
    expect(listPantryEvents()[0]).toMatchObject({
      eventType: 'purchase_added',
      relatedShoppingListItemId: itemId,
      actorProfileId: profileId,
    });
  });

  it('confirms atomic FEFO deductions with full linkage and safely undoes unchanged stock', () => {
    const first = createPantryBatch(
      pantryBatchInputSchema.parse({
        productId,
        quantityRemaining: 100,
        originalQuantity: 100,
        unit: 'g',
        locationId,
        useByDate: '2027-04-01',
        expiryPrecision: 'exact',
      }),
      profileId,
    );
    const second = createPantryBatch(
      pantryBatchInputSchema.parse({
        productId,
        quantityRemaining: 200,
        originalQuantity: 200,
        unit: 'g',
        locationId,
        useByDate: '2027-05-01',
        expiryPrecision: 'exact',
      }),
      profileId,
    );
    const session = startCookSession(recipeId, profileId, 2, mealId);
    confirmCookSessionWithPantry(
      session.id,
      { confirmed: true, consumptions: [{ productId, quantity: 150, unit: 'g' }], leftovers: [] },
      profileId,
    );
    const byId = new Map(
      getPantryDashboard({ q: '', view: 'all', sort: 'expiry', includeInactive: true }).batches.map(
        (batch) => [batch.id, batch],
      ),
    );
    expect(byId.get(first.id)?.quantityRemaining).toBe(0);
    expect(byId.get(second.id)?.quantityRemaining).toBe(150);
    expect(getDatabase().select().from(pantryCookSessionDeductions).all()).toHaveLength(2);
    expect(
      listPantryEvents().filter((event) => event.relatedCookSessionId === session.id),
    ).toHaveLength(2);
    undoCookSessionPantry(session.id, profileId);
    const restored = new Map(getPantryDashboard().batches.map((batch) => [batch.id, batch]));
    expect(restored.get(first.id)?.quantityRemaining).toBe(100);
    expect(restored.get(second.id)?.quantityRemaining).toBe(200);
    expect(() => undoCookSessionPantry(session.id, profileId)).toThrow('not reversible');
  });

  it('previews the same exact FEFO batches and preserves planned-meal identity', () => {
    const first = createPantryBatch(
      pantryBatchInputSchema.parse({
        productId,
        quantityRemaining: 100,
        originalQuantity: 100,
        unit: 'g',
        locationId,
        useByDate: '2027-04-01',
        expiryPrecision: 'exact',
      }),
      profileId,
    );
    const second = createPantryBatch(
      pantryBatchInputSchema.parse({
        productId,
        quantityRemaining: 200,
        originalQuantity: 200,
        unit: 'g',
        locationId,
        useByDate: '2027-05-01',
        expiryPrecision: 'exact',
      }),
      profileId,
    );
    const allocation = previewPantryProductConsumption(productId, 150, 'g');
    expect(allocation).toMatchObject({
      productName: 'Red lentils',
      sufficient: true,
      availableQuantity: 300,
    });
    expect(
      allocation.deductions.map(({ batchId, quantity, expiryDate }) => ({
        batchId,
        quantity,
        expiryDate,
      })),
    ).toEqual([
      { batchId: first.id, quantity: 100, expiryDate: '2027-04-01' },
      { batchId: second.id, quantity: 50, expiryDate: '2027-05-01' },
    ]);
    const session = startCookSession(recipeId, profileId, 2, mealId);
    const preview = getCookSessionPantryPreview(session.id, profileId);
    expect(preview.plannedMeal).toMatchObject({ id: mealId, title: 'Lentil soup' });
    expect(preview.recommendedConsumptions[0]).toMatchObject({ ingredientName: 'red lentils' });
    expect(preview.recommendedConsumptions[0]!.preview.deductions[0]!.batchId).toBe(first.id);
    expect(
      getPantryDashboard().batches.find((batch) => batch.id === first.id)?.quantityRemaining,
    ).toBe(100);
  });

  it('rolls back inventory compensation when the cook-plan transition fails', () => {
    const batch = createPantryBatch(
      pantryBatchInputSchema.parse({
        productId,
        quantityRemaining: 200,
        originalQuantity: 200,
        unit: 'g',
        locationId,
        expiryPrecision: 'unknown',
      }),
      profileId,
    );
    const session = startCookSession(recipeId, profileId, 2, mealId);
    confirmCookSessionWithPantry(
      session.id,
      { confirmed: true, consumptions: [{ productId, quantity: 100, unit: 'g' }], leftovers: [] },
      profileId,
    );
    getDatabase().run(
      sql.raw(`CREATE TRIGGER pantry_test_block_plan_undo
        BEFORE UPDATE ON pantry_cook_session_plans
        WHEN NEW.state = 'undone'
        BEGIN SELECT RAISE(ABORT, 'blocked plan transition'); END`),
    );
    expect(() => undoCookSessionPantry(session.id, profileId)).toThrow('blocked plan transition');
    expect(
      getPantryDashboard().batches.find((entry) => entry.id === batch.id)?.quantityRemaining,
    ).toBe(100);
    expect(getDatabase().select().from(pantryCookSessionPlans).all()[0]!.state).toBe('confirmed');
    expect(
      getDatabase()
        .select()
        .from(pantryInventoryEvents)
        .all()
        .filter((event) => event.eventType === 'action_undone'),
    ).toHaveLength(0);
  });

  it('rejects undo after newer batch activity and when linked leftovers exist', () => {
    const batch = createPantryBatch(
      pantryBatchInputSchema.parse({
        productId,
        quantityRemaining: 300,
        originalQuantity: 300,
        unit: 'g',
        locationId,
        expiryPrecision: 'unknown',
      }),
      profileId,
    );
    const session = startCookSession(recipeId, profileId, 2, mealId);
    confirmCookSessionWithPantry(
      session.id,
      { confirmed: true, consumptions: [{ productId, quantity: 100, unit: 'g' }], leftovers: [] },
      profileId,
    );
    const changed = getPantryDashboard().batches.find((entry) => entry.id === batch.id)!;
    applyPantryBatchAction(
      batch.id,
      {
        type: 'consume',
        expectedVersion: changed.version,
        quantity: 1,
        unit: 'g',
        note: '',
        reason: 'Taste',
      },
      profileId,
    );
    expect(() => undoCookSessionPantry(session.id, profileId)).toThrow(
      'stock changed after cooking',
    );

    const leftoverSession = startCookSession(recipeId, profileId, 2, mealId);
    confirmCookSessionWithPantry(
      leftoverSession.id,
      {
        confirmed: true,
        consumptions: [],
        leftovers: [{ productId, locationId, quantity: 1, unit: 'each', notes: '' }],
      },
      profileId,
    );
    expect(() => undoCookSessionPantry(leftoverSession.id, profileId)).toThrow(
      'Review or remove linked leftovers',
    );
  });

  it('links a leftover batch to recipe, planned meal, cook session, and actor', () => {
    const session = startCookSession(recipeId, profileId, 2, mealId);
    const result = confirmCookSessionWithPantry(
      session.id,
      {
        confirmed: true,
        consumptions: [],
        leftovers: [{ productId, locationId, quantity: 2, unit: 'each', notes: 'Two portions' }],
      },
      profileId,
    );
    expect(result.leftovers).toHaveLength(1);
    expect(getDatabase().select().from(pantryCookSessionLeftovers).all()[0]).toMatchObject({
      cookSessionId: session.id,
      batchId: result.leftovers[0]!.id,
    });
    expect(getDatabase().select().from(pantryBatches).all()[0]).toMatchObject({
      sourceRecipeId: recipeId,
      sourceMealPlanEntryId: mealId,
      createdByProfileId: profileId,
    });
    expect(getDatabase().select().from(pantryInventoryEvents).all()[0]).toMatchObject({
      relatedCookSessionId: session.id,
      actorProfileId: profileId,
    });
    expect(getDatabase().select().from(cookSessions).all()[0]!.completedAt).not.toBeNull();
  });
});
