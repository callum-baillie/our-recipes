import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { eq } from 'drizzle-orm';

import { getDatabase, resetDatabaseForTests } from '@/lib/db/client';
import {
  mealPlanEntries,
  cookSessions,
  pantryBatches,
  recipeIngredientGroups,
  recipeIngredientProductMappings,
  recipeIngredients,
  recipes,
} from '@/lib/db/schema';
import { pantryBatchInputSchema, pantryProductInputSchema } from '@/lib/domain/pantry';
import { completeSetup } from '@/lib/services/household-service';
import {
  getProjectedPantryDemand,
  getRecipePantryAvailability,
  removeRecipeIngredientPantryMapping,
  setRecipeIngredientPantryMapping,
} from '@/lib/services/pantry-availability-service';
import {
  createPantryBatch,
  createPantryProduct,
  ensureDefaultPantryLocations,
  listPantryLocations,
} from '@/lib/services/pantry-service';
import {
  addMealPlanEntry,
  listPlannedMeals,
  refreshMealPlanRecipeSnapshot,
  updateMealPlanEntryStatus,
} from '@/lib/services/planning-service';

describe('Pantry availability service', () => {
  let profileId: string;
  let recipeId: string;
  let ingredientId: string;
  let productId: string;

  beforeEach(() => {
    vi.stubEnv('DATABASE_URL', ':memory:');
    vi.stubEnv('DATA_DIR', './.test-data/pantry-availability-media');
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
    const locationId = listPantryLocations()[0]!.id;
    const product = createPantryProduct(
      pantryProductInputSchema.parse({
        displayName: 'Red lentils',
        defaultInventoryUnit: 'g',
        defaultStorageType: 'pantry',
      }),
      profileId,
    );
    productId = product.id;
    createPantryBatch(
      pantryBatchInputSchema.parse({
        productId,
        quantityRemaining: 250,
        originalQuantity: 250,
        unit: 'g',
        locationId,
      }),
      profileId,
    );
    createPantryBatch(
      pantryBatchInputSchema.parse({
        productId,
        approximateState: 'half',
        locationId,
      }),
      profileId,
    );
    recipeId = crypto.randomUUID();
    ingredientId = '20000000-0000-4000-8000-000000000000';
    const groupId = crypto.randomUUID();
    const now = new Date();
    getDatabase()
      .insert(recipes)
      .values({
        id: recipeId,
        title: 'Lentil soup',
        summary: '',
        status: 'active',
        servings: '4 servings',
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
      .values({
        id: groupId,
        recipeId,
        position: 0,
        name: '',
      })
      .run();
    getDatabase()
      .insert(recipeIngredients)
      .values({
        id: ingredientId,
        recipeId,
        groupId,
        position: 0,
        quantity: 100,
        unit: 'g',
        item: 'lentils, rinsed',
        note: 'keep this exact recipe text',
      })
      .run();
  });

  afterEach(() => {
    resetDatabaseForTests();
    vi.unstubAllEnvs();
  });

  it('saves an actor-attributed manual mapping without rewriting recipe text', () => {
    setRecipeIngredientPantryMapping(
      ingredientId,
      { productId, compatibleVariant: false, isOptional: false },
      profileId,
    );
    expect(
      getDatabase()
        .select()
        .from(recipeIngredientProductMappings)
        .where(eq(recipeIngredientProductMappings.recipeIngredientId, ingredientId))
        .get(),
    ).toMatchObject({ matchType: 'manual', mappedByProfileId: profileId, productId });
    expect(
      getDatabase()
        .select({ item: recipeIngredients.item, note: recipeIngredients.note })
        .from(recipeIngredients)
        .where(eq(recipeIngredients.id, ingredientId))
        .get(),
    ).toEqual({ item: 'lentils, rinsed', note: 'keep this exact recipe text' });
    removeRecipeIngredientPantryMapping(ingredientId);
    expect(getRecipePantryAvailability(recipeId).state).toBe('unknown');
  });

  it('persists an omitted use-by as null and projects the supplied best-before date', () => {
    const locationId = listPantryLocations()[0]!.id;
    const input = pantryBatchInputSchema.parse({
      productId,
      quantityRemaining: 300,
      originalQuantity: 300,
      unit: 'g',
      locationId,
      bestBeforeDate: '2027-04-02',
      expiryPrecision: 'exact',
    });
    expect(input.useByDate).toBeNull();
    const batch = createPantryBatch(input, profileId);
    expect(
      getDatabase()
        .select({
          useByDate: pantryBatches.useByDate,
          bestBeforeDate: pantryBatches.bestBeforeDate,
        })
        .from(pantryBatches)
        .where(eq(pantryBatches.id, batch.id))
        .get(),
    ).toEqual({ useByDate: null, bestBeforeDate: '2027-04-02' });
    setRecipeIngredientPantryMapping(
      ingredientId,
      { productId, compatibleVariant: false, isOptional: false },
      profileId,
    );

    expect(
      getRecipePantryAvailability(recipeId).ingredients[0]?.matchingBatches.find(
        (candidate) => candidate.batchId === batch.id,
      ),
    ).toMatchObject({ expiryDate: '2027-04-02' });
  });

  it('scales availability and aggregates non-mutating multi-meal demand', () => {
    setRecipeIngredientPantryMapping(
      ingredientId,
      { productId, compatibleVariant: false, isOptional: false },
      profileId,
    );
    expect(getRecipePantryAvailability(recipeId, 8)).toMatchObject({
      state: 'ready',
      targetServings: 8,
    });
    expect(getRecipePantryAvailability(recipeId, 12)).toMatchObject({ state: 'unknown' });
    const now = new Date();
    getDatabase()
      .insert(mealPlanEntries)
      .values([
        {
          id: crypto.randomUUID(),
          plannedFor: '2026-07-20',
          meal: 'dinner',
          recipeId,
          title: '',
          servings: 4,
          note: '',
          createdByProfileId: profileId,
          updatedByProfileId: profileId,
          createdAt: now,
          updatedAt: now,
        },
        {
          id: crypto.randomUUID(),
          plannedFor: '2026-07-22',
          meal: 'dinner',
          recipeId,
          title: '',
          servings: 8,
          note: '',
          createdByProfileId: profileId,
          updatedByProfileId: profileId,
          createdAt: now,
          updatedAt: now,
        },
      ])
      .run();
    const before = getDatabase().select().from(pantryBatches).all();
    expect(getProjectedPantryDemand('2026-07-20', '2026-07-26').lines[0]).toMatchObject({
      requiredQuantity: 300,
      availableQuantity: 250,
      shortageQuantity: null,
      state: 'uncertain',
    });
    expect(getDatabase().select().from(pantryBatches).all()).toEqual(before);
  });

  it('allocates shared product stock once across duplicate mapped ingredients', () => {
    setRecipeIngredientPantryMapping(
      ingredientId,
      { productId, compatibleVariant: false, isOptional: false },
      profileId,
    );
    const secondIngredientId = crypto.randomUUID();
    const group = getDatabase()
      .select({ id: recipeIngredientGroups.id })
      .from(recipeIngredientGroups)
      .where(eq(recipeIngredientGroups.recipeId, recipeId))
      .get()!;
    getDatabase()
      .insert(recipeIngredients)
      .values({
        id: secondIngredientId,
        recipeId,
        groupId: group.id,
        position: 1,
        quantity: 200,
        unit: 'g',
        item: 'lentil topping',
        note: 'separate recipe line',
      })
      .run();
    setRecipeIngredientPantryMapping(
      secondIngredientId,
      { productId, compatibleVariant: false, isOptional: false },
      profileId,
    );

    const result = getRecipePantryAvailability(recipeId, 8);

    expect(result.state).toBe('unknown');
    expect(result.ingredients).toMatchObject([
      { id: ingredientId, state: 'ready', requiredQuantity: 200, availableQuantity: 250 },
      {
        id: secondIngredientId,
        state: 'unknown',
        requiredQuantity: 400,
        availableQuantity: 50,
        shortageQuantity: null,
      },
    ]);
    expect(
      getDatabase()
        .select({ item: recipeIngredients.item, note: recipeIngredients.note })
        .from(recipeIngredients)
        .where(eq(recipeIngredients.id, secondIngredientId))
        .get(),
    ).toEqual({ item: 'lentil topping', note: 'separate recipe line' });
  });

  it('keeps projected demand pinned until the planned recipe snapshot is explicitly refreshed', () => {
    setRecipeIngredientPantryMapping(
      ingredientId,
      { productId, compatibleVariant: false, isOptional: false },
      profileId,
    );
    const meal = addMealPlanEntry(
      {
        plannedFor: '2026-07-21',
        meal: 'dinner',
        recipeId,
        title: '',
        servings: 4,
        note: '',
      },
      profileId,
    );
    getDatabase()
      .update(recipeIngredients)
      .set({ quantity: 500 })
      .where(eq(recipeIngredients.id, ingredientId))
      .run();
    getDatabase()
      .update(recipes)
      .set({ currentRevision: 2, updatedAt: new Date() })
      .where(eq(recipes.id, recipeId))
      .run();

    expect(getProjectedPantryDemand('2026-07-20', '2026-07-26').lines[0]).toMatchObject({
      requiredQuantity: 100,
    });
    refreshMealPlanRecipeSnapshot(meal.id, profileId);
    expect(getProjectedPantryDemand('2026-07-20', '2026-07-26').lines[0]).toMatchObject({
      requiredQuantity: 500,
    });
  });

  it('persists skipped and cancelled status, derives cooked, and excludes all three from demand', () => {
    setRecipeIngredientPantryMapping(
      ingredientId,
      { productId, compatibleVariant: false, isOptional: false },
      profileId,
    );
    const ids = {
      active: crypto.randomUUID(),
      skipped: crypto.randomUUID(),
      cancelled: crypto.randomUUID(),
      cooked: crypto.randomUUID(),
    };
    const now = new Date();
    getDatabase()
      .insert(mealPlanEntries)
      .values(
        Object.entries(ids).map(([key, id], index) => ({
          id,
          plannedFor: `2026-07-${20 + index}`,
          meal: 'dinner' as const,
          recipeId,
          title: '',
          servings: 4,
          note: key,
          status: 'planned' as const,
          createdByProfileId: profileId,
          updatedByProfileId: profileId,
          createdAt: now,
          updatedAt: now,
        })),
      )
      .run();
    updateMealPlanEntryStatus(ids.skipped, 'skipped', profileId);
    updateMealPlanEntryStatus(ids.cancelled, 'cancelled', profileId);
    getDatabase()
      .insert(cookSessions)
      .values({
        id: crypto.randomUUID(),
        recipeId,
        profileId,
        targetServings: 4,
        mealPlanEntryId: ids.cooked,
        startedAt: now,
        completedAt: now,
      })
      .run();

    const meals = listPlannedMeals('2026-07-20', '2026-07-26');
    expect(meals.find((meal) => meal.id === ids.skipped)).toMatchObject({
      status: 'skipped',
      effectiveStatus: 'skipped',
    });
    expect(meals.find((meal) => meal.id === ids.cancelled)).toMatchObject({
      status: 'cancelled',
      effectiveStatus: 'cancelled',
    });
    expect(meals.find((meal) => meal.id === ids.cooked)?.effectiveStatus).toBe('cooked');
    expect(getProjectedPantryDemand('2026-07-20', '2026-07-26').lines[0]).toMatchObject({
      requiredQuantity: 100,
      state: 'covered',
    });
  });

  it('keeps stable service order while reserving shared stock for required ingredients', () => {
    setRecipeIngredientPantryMapping(
      ingredientId,
      { productId, compatibleVariant: false, isOptional: false },
      profileId,
    );
    const optionalIngredientId = '10000000-0000-4000-8000-000000000000';
    const group = getDatabase()
      .select({ id: recipeIngredientGroups.id })
      .from(recipeIngredientGroups)
      .where(eq(recipeIngredientGroups.recipeId, recipeId))
      .get()!;
    getDatabase()
      .insert(recipeIngredients)
      .values({
        id: optionalIngredientId,
        recipeId,
        groupId: group.id,
        position: 0,
        quantity: 200,
        unit: 'g',
        item: 'optional lentil topping',
        note: 'appears first by stable ID',
      })
      .run();
    setRecipeIngredientPantryMapping(
      optionalIngredientId,
      { productId, compatibleVariant: false, isOptional: true },
      profileId,
    );

    const first = getRecipePantryAvailability(recipeId);
    const second = getRecipePantryAvailability(recipeId);

    expect(second).toEqual(first);
    expect(first.state).toBe('ready');
    expect(first.ingredients).toMatchObject([
      {
        id: optionalIngredientId,
        state: 'unknown',
        availableQuantity: 150,
        shortageQuantity: null,
      },
      { id: ingredientId, state: 'ready', availableQuantity: 250, shortageQuantity: 0 },
    ]);
  });
});
