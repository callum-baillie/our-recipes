import { and, asc, desc, eq, gte, inArray, isNotNull, lte } from 'drizzle-orm';
import { randomUUID } from 'node:crypto';

import { getDatabase, ensureDatabase } from '@/lib/db/client';
import {
  mealPlanEntries,
  pantryPurchaseIntakes,
  pantryShoppingItemDetails,
  cookSessions,
  nutritionMealAllocationVersions,
  recipeNutritionCalculations,
  recipeIngredientProductMappings,
  recipeIngredients,
  pantryProducts,
  recipes,
  shoppingAisles,
  shoppingListItems,
  shoppingLists,
} from '@/lib/db/schema';
import type {
  DuplicateWeekInput,
  MealPlanBatchInput,
  MealPlanEntryInput,
  ShoppingAisleInput,
  ShoppingListItemInput,
  MealPlanStatus,
  MealPlanEntryUpdateInput,
  SwapMealPlanEntriesInput,
} from '@/lib/domain/planning';
import {
  EMPTY_MEAL_PLAN_INGREDIENT_SNAPSHOT,
  parseMealPlanIngredientSnapshot,
  serializeMealPlanIngredientSnapshot,
} from '@/lib/domain/meal-plan-snapshot';
import {
  getShoppingItemPantryDetails,
  recordShoppingItemManualOverrides,
  type ShoppingDetail,
} from '@/lib/services/pantry-grocery-cooking-service';
import {
  getListSettings,
  getShoppingListProductId,
  getSupermarketProfile,
  listAislesForSupermarket,
  listSupermarketProfiles,
  rememberShoppingAisle,
  resolveShoppingAisle,
  type ListSettingsView,
  type SupermarketProfileView,
} from '@/lib/services/list-settings-service';
import { getRecipe } from '@/lib/services/recipe-service';

export class PlanningNotFoundError extends Error {}

export type PlanningTransaction = Parameters<
  Parameters<ReturnType<typeof getDatabase>['transaction']>[0]
>[0];
export type MealPlanEntriesInserted = (
  transaction: PlanningTransaction,
  entries: Array<typeof mealPlanEntries.$inferInsert>,
) => void;
export type MealPlanEntryChanged = (
  transaction: PlanningTransaction,
  previous: typeof mealPlanEntries.$inferSelect,
  next: typeof mealPlanEntries.$inferSelect | null,
) => void;

export type PlannedMeal = typeof mealPlanEntries.$inferSelect & {
  recipeTitle: string;
  recipeChangedSincePlanning: boolean;
  effectiveStatus: MealPlanStatus | 'cooked';
};

function recipePlanSnapshot(
  executor: PlanningTransaction | ReturnType<typeof getDatabase>,
  recipeId: string,
) {
  const recipe = executor
    .select({
      title: recipes.title,
      currentRevision: recipes.currentRevision,
      servings: recipes.servings,
    })
    .from(recipes)
    .where(eq(recipes.id, recipeId))
    .get();
  if (!recipe)
    throw new PlanningNotFoundError('Choose a recipe that still exists in this household.');
  const calculation = executor
    .select({ id: recipeNutritionCalculations.id })
    .from(recipeNutritionCalculations)
    .where(
      and(
        eq(recipeNutritionCalculations.recipeId, recipeId),
        eq(recipeNutritionCalculations.recipeRevision, recipe.currentRevision),
      ),
    )
    .orderBy(desc(recipeNutritionCalculations.revision))
    .get();
  const ingredients = executor
    .select({
      ingredientId: recipeIngredients.id,
      item: recipeIngredients.item,
      quantity: recipeIngredients.quantity,
      unit: recipeIngredients.unit,
      note: recipeIngredients.note,
      productId: recipeIngredientProductMappings.productId,
      productName: pantryProducts.displayName,
      isOptional: recipeIngredientProductMappings.isOptional,
    })
    .from(recipeIngredients)
    .leftJoin(
      recipeIngredientProductMappings,
      eq(recipeIngredientProductMappings.recipeIngredientId, recipeIngredients.id),
    )
    .leftJoin(pantryProducts, eq(pantryProducts.id, recipeIngredientProductMappings.productId))
    .where(eq(recipeIngredients.recipeId, recipeId))
    .all();
  return {
    recipeRevision: recipe.currentRevision,
    recipeCalculationId: calculation?.id ?? null,
    recipeTitleSnapshot: recipe.title,
    recipeIngredientsSnapshot: serializeMealPlanIngredientSnapshot({
      baseServings: recipe.servings,
      ingredients: ingredients.map((ingredient) => ({
        ...ingredient,
        isOptional: ingredient.isOptional ?? false,
      })),
    }),
  };
}
export type ShoppingListDetail = typeof shoppingLists.$inferSelect & {
  items: Array<typeof shoppingListItems.$inferSelect & { pantry: ShoppingDetail | null }>;
  aisles: Array<typeof shoppingAisles.$inferSelect>;
  settings: ListSettingsView;
  supermarketProfile: SupermarketProfileView | null;
  supermarketProfiles: SupermarketProfileView[];
};

export type ShoppingListSummary = typeof shoppingLists.$inferSelect & {
  itemCount: number;
  checkedCount: number;
  supermarketName: string | null;
  supermarketLocation: string;
};

export function listPlannedMeals(weekStart: string, weekEnd: string): PlannedMeal[] {
  ensureDatabase();
  const db = getDatabase();
  const entries = db
    .select()
    .from(mealPlanEntries)
    .where(
      and(gte(mealPlanEntries.plannedFor, weekStart), lte(mealPlanEntries.plannedFor, weekEnd)),
    )
    .orderBy(asc(mealPlanEntries.plannedFor), asc(mealPlanEntries.meal))
    .all();
  if (!entries.length) return [];
  const recipeIds = entries.flatMap((entry) => (entry.recipeId ? [entry.recipeId] : []));
  const titles = recipeIds.length
    ? db
        .select({ id: recipes.id, title: recipes.title, currentRevision: recipes.currentRevision })
        .from(recipes)
        .where(inArray(recipes.id, recipeIds))
        .all()
    : [];
  const calculations = recipeIds.length
    ? db
        .select({
          id: recipeNutritionCalculations.id,
          recipeId: recipeNutritionCalculations.recipeId,
          recipeRevision: recipeNutritionCalculations.recipeRevision,
          revision: recipeNutritionCalculations.revision,
        })
        .from(recipeNutritionCalculations)
        .where(inArray(recipeNutritionCalculations.recipeId, recipeIds))
        .orderBy(desc(recipeNutritionCalculations.revision))
        .all()
    : [];
  const cookedEntryIds = new Set(
    db
      .select({ mealPlanEntryId: cookSessions.mealPlanEntryId })
      .from(cookSessions)
      .where(isNotNull(cookSessions.completedAt))
      .all()
      .flatMap(({ mealPlanEntryId }) => (mealPlanEntryId ? [mealPlanEntryId] : [])),
  );
  return entries.map((entry) => {
    const currentRecipe = entry.recipeId
      ? titles.find((recipe) => recipe.id === entry.recipeId)
      : null;
    const currentCalculation = currentRecipe
      ? calculations.find(
          (calculation) =>
            calculation.recipeId === currentRecipe.id &&
            calculation.recipeRevision === currentRecipe.currentRevision,
        )
      : null;
    return {
      ...entry,
      recipeTitle: entry.recipeId
        ? entry.recipeTitleSnapshot || currentRecipe?.title || 'Deleted recipe'
        : entry.title,
      recipeChangedSincePlanning: Boolean(
        currentRecipe &&
        entry.recipeRevision !== null &&
        (currentRecipe.currentRevision !== entry.recipeRevision ||
          (entry.recipeCalculationId ?? null) !== (currentCalculation?.id ?? null)),
      ),
      effectiveStatus: cookedEntryIds.has(entry.id) ? 'cooked' : entry.status,
    };
  });
}

export function refreshMealPlanRecipeSnapshot(
  entryId: string,
  actorProfileId: string,
): PlannedMeal {
  ensureDatabase();
  const database = getDatabase();
  const plannedFor = database.transaction((transaction) => {
    const existing = transaction
      .select()
      .from(mealPlanEntries)
      .where(eq(mealPlanEntries.id, entryId))
      .get();
    if (!existing) throw new PlanningNotFoundError('That planned meal no longer exists.');
    if (!existing.recipeId) {
      throw new PlanningNotFoundError('A free-form meal has no recipe snapshot to refresh.');
    }
    transaction
      .update(mealPlanEntries)
      .set({
        ...recipePlanSnapshot(transaction, existing.recipeId),
        updatedByProfileId: actorProfileId,
        updatedAt: new Date(),
      })
      .where(eq(mealPlanEntries.id, entryId))
      .run();
    return existing.plannedFor;
  });
  return listPlannedMeals(plannedFor, plannedFor).find((meal) => meal.id === entryId)!;
}

export function updateMealPlanEntryStatus(
  entryId: string,
  status: MealPlanStatus,
  actorProfileId: string,
  onChanged?: MealPlanEntryChanged,
): PlannedMeal {
  ensureDatabase();
  const database = getDatabase();
  const existing = database.transaction((transaction) => {
    const previous = transaction
      .select()
      .from(mealPlanEntries)
      .where(eq(mealPlanEntries.id, entryId))
      .get();
    if (!previous) throw new PlanningNotFoundError('That planned meal no longer exists.');
    const next = { ...previous, status, updatedByProfileId: actorProfileId, updatedAt: new Date() };
    transaction.update(mealPlanEntries).set(next).where(eq(mealPlanEntries.id, entryId)).run();
    onChanged?.(transaction, previous, next);
    return next;
  });
  return listPlannedMeals(existing.plannedFor, existing.plannedFor).find(
    (meal) => meal.id === entryId,
  )!;
}

export function updateMealPlanEntry(
  entryId: string,
  input: MealPlanEntryUpdateInput,
  actorProfileId: string,
  onChanged?: MealPlanEntryChanged,
): PlannedMeal {
  ensureDatabase();
  const database = getDatabase();
  const recipe = input.recipeId ? getRecipe(input.recipeId) : null;
  if (input.recipeId && !recipe) {
    throw new PlanningNotFoundError('Choose a recipe that still exists in this household.');
  }
  database.transaction((transaction) => {
    const existing = transaction
      .select()
      .from(mealPlanEntries)
      .where(eq(mealPlanEntries.id, entryId))
      .get();
    if (!existing) throw new PlanningNotFoundError('That planned meal no longer exists.');
    if (existing.updatedAt.toISOString() !== input.expectedUpdatedAt) {
      throw new PlanningNotFoundError('That planned meal changed. Refresh before saving.');
    }
    const next = {
      ...existing,
      plannedFor: input.plannedFor,
      meal: input.meal,
      recipeId: input.recipeId || null,
      title: input.title,
      servings: input.servings,
      note: input.note,
      updatedByProfileId: actorProfileId,
      updatedAt: new Date(),
      ...(input.recipeId && input.recipeId !== existing.recipeId
        ? recipePlanSnapshot(transaction, input.recipeId)
        : input.recipeId
          ? {}
          : {
              recipeRevision: null,
              recipeCalculationId: null,
              recipeTitleSnapshot: '',
              recipeIngredientsSnapshot: EMPTY_MEAL_PLAN_INGREDIENT_SNAPSHOT,
            }),
    };
    transaction.update(mealPlanEntries).set(next).where(eq(mealPlanEntries.id, entryId)).run();
    onChanged?.(transaction, existing, next);
  });
  return listPlannedMeals(input.plannedFor, input.plannedFor).find((meal) => meal.id === entryId)!;
}

export function swapMealPlanEntries(
  input: SwapMealPlanEntriesInput,
  actorProfileId: string,
): [PlannedMeal, PlannedMeal] {
  ensureDatabase();
  const database = getDatabase();
  database.transaction((transaction) => {
    const source = transaction
      .select()
      .from(mealPlanEntries)
      .where(eq(mealPlanEntries.id, input.sourceId))
      .get();
    const target = transaction
      .select()
      .from(mealPlanEntries)
      .where(eq(mealPlanEntries.id, input.targetId))
      .get();
    if (!source || !target)
      throw new PlanningNotFoundError('Choose two planned meals that still exist.');
    if (
      source.updatedAt.toISOString() !== input.sourceExpectedUpdatedAt ||
      target.updatedAt.toISOString() !== input.targetExpectedUpdatedAt
    ) {
      throw new PlanningNotFoundError('One of those meals changed. Refresh before swapping.');
    }
    const now = new Date();
    transaction
      .update(mealPlanEntries)
      .set({
        plannedFor: target.plannedFor,
        meal: target.meal,
        updatedByProfileId: actorProfileId,
        updatedAt: now,
      })
      .where(eq(mealPlanEntries.id, source.id))
      .run();
    transaction
      .update(mealPlanEntries)
      .set({
        plannedFor: source.plannedFor,
        meal: source.meal,
        updatedByProfileId: actorProfileId,
        updatedAt: now,
      })
      .where(eq(mealPlanEntries.id, target.id))
      .run();
  });
  const range = [
    ...new Set(
      getDatabase()
        .select({ plannedFor: mealPlanEntries.plannedFor })
        .from(mealPlanEntries)
        .where(inArray(mealPlanEntries.id, [input.sourceId, input.targetId]))
        .all()
        .map((entry) => entry.plannedFor),
    ),
  ].sort();
  const meals = listPlannedMeals(range[0]!, range.at(-1)!);
  return [
    meals.find((meal) => meal.id === input.sourceId)!,
    meals.find((meal) => meal.id === input.targetId)!,
  ];
}

export function addMealPlanEntry(
  input: MealPlanEntryInput,
  actorProfileId: string,
  onInserted?: MealPlanEntriesInserted,
): PlannedMeal {
  ensureDatabase();
  const recipeId = input.recipeId ?? '';
  const title = input.title ?? '';
  const recipe = recipeId ? getRecipe(recipeId) : null;
  if (recipeId && !recipe)
    throw new PlanningNotFoundError('Choose a recipe that still exists in this household.');
  const now = new Date();
  const entry: typeof mealPlanEntries.$inferInsert = {
    id: randomUUID(),
    plannedFor: input.plannedFor,
    meal: input.meal,
    recipeId: recipeId || null,
    ...(recipeId
      ? recipePlanSnapshot(getDatabase(), recipeId)
      : {
          recipeRevision: null,
          recipeCalculationId: null,
          recipeTitleSnapshot: '',
          recipeIngredientsSnapshot: EMPTY_MEAL_PLAN_INGREDIENT_SNAPSHOT,
        }),
    title,
    servings: input.servings,
    note: input.note,
    status: 'planned',
    createdByProfileId: actorProfileId,
    updatedByProfileId: actorProfileId,
    createdAt: now,
    updatedAt: now,
  };
  const database = getDatabase();
  database.transaction((transaction) => {
    transaction.insert(mealPlanEntries).values(entry).run();
    onInserted?.(transaction, [entry]);
  });
  return listPlannedMeals(entry.plannedFor, entry.plannedFor).find((meal) => meal.id === entry.id)!;
}

export function addMealPlanEntries(
  input: MealPlanBatchInput,
  actorProfileId: string,
  onInserted?: MealPlanEntriesInserted,
): PlannedMeal[] {
  ensureDatabase();
  let entries: Array<typeof mealPlanEntries.$inferInsert> = [];
  getDatabase().transaction((transaction) => {
    entries = insertMealPlanEntriesInTransaction(transaction, input, actorProfileId, onInserted);
  });

  const dates = entries.map((entry) => entry.plannedFor).sort();
  const insertedIds = new Set(entries.map((entry) => entry.id));
  return listPlannedMeals(dates[0]!, dates.at(-1)!).filter((meal) => insertedIds.has(meal.id));
}

export function insertMealPlanEntriesInTransaction(
  transaction: PlanningTransaction,
  input: MealPlanBatchInput,
  actorProfileId: string,
  onInserted?: MealPlanEntriesInserted,
): Array<typeof mealPlanEntries.$inferInsert> {
  const recipeIds = [...new Set(input.entries.map((entry) => entry.recipeId).filter(Boolean))];
  const savedRecipeIds = recipeIds.length
    ? new Set(
        transaction
          .select({ id: recipes.id })
          .from(recipes)
          .where(inArray(recipes.id, recipeIds))
          .all()
          .map(({ id }) => id),
      )
    : new Set<string>();
  if (recipeIds.some((recipeId) => !savedRecipeIds.has(recipeId))) {
    throw new PlanningNotFoundError('Choose recipes that still exist in this household.');
  }
  const now = new Date();
  const entries: Array<typeof mealPlanEntries.$inferInsert> = input.entries.map((entry) => ({
    id: randomUUID(),
    plannedFor: entry.plannedFor,
    meal: entry.meal,
    recipeId: entry.recipeId || null,
    ...(entry.recipeId
      ? recipePlanSnapshot(transaction, entry.recipeId)
      : {
          recipeRevision: null,
          recipeCalculationId: null,
          recipeTitleSnapshot: '',
          recipeIngredientsSnapshot: EMPTY_MEAL_PLAN_INGREDIENT_SNAPSHOT,
        }),
    title: entry.title,
    servings: entry.servings,
    note: entry.note,
    status: 'planned',
    createdByProfileId: actorProfileId,
    updatedByProfileId: actorProfileId,
    createdAt: now,
    updatedAt: now,
  }));
  transaction.insert(mealPlanEntries).values(entries).run();
  onInserted?.(transaction, entries);
  return entries;
}

function addDays(isoDate: string, days: number): string {
  const value = new Date(`${isoDate}T12:00:00Z`);
  value.setUTCDate(value.getUTCDate() + days);
  return value.toISOString().slice(0, 10);
}

export function duplicateWeek(
  input: DuplicateWeekInput,
  actorProfileId: string,
  onInserted?: MealPlanEntriesInserted,
): PlannedMeal[] {
  ensureDatabase();
  const sourceWeekEnd = addDays(input.weekStart, 6);
  const copied = listPlannedMeals(input.weekStart, sourceWeekEnd);
  const offsetDays = Math.round(
    (Date.parse(`${input.destinationWeekStart}T00:00:00Z`) -
      Date.parse(`${input.weekStart}T00:00:00Z`)) /
      86_400_000,
  );
  const now = new Date();
  const entries = copied.map((entry) => ({
    id: randomUUID(),
    plannedFor: addDays(entry.plannedFor, offsetDays),
    meal: entry.meal,
    recipeId: entry.recipeId,
    recipeRevision: entry.recipeRevision,
    recipeCalculationId: entry.recipeCalculationId,
    recipeTitleSnapshot: entry.recipeTitleSnapshot,
    recipeIngredientsSnapshot: entry.recipeIngredientsSnapshot,
    title: entry.title,
    servings: entry.servings,
    note: entry.note,
    status: entry.status,
    createdByProfileId: actorProfileId,
    updatedByProfileId: actorProfileId,
    createdAt: now,
    updatedAt: now,
  }));
  if (entries.length) {
    getDatabase().transaction((transaction) => {
      transaction.insert(mealPlanEntries).values(entries).run();
      onInserted?.(transaction, entries);
    });
  }
  return listPlannedMeals(input.destinationWeekStart, addDays(input.destinationWeekStart, 6));
}

function icsEscape(value: string): string {
  return value
    .replace(/\\/g, '\\\\')
    .replace(/;/g, '\\;')
    .replace(/,/g, '\\,')
    .replace(/\r?\n/g, '\\n');
}

function icsDate(isoDate: string): string {
  return isoDate.replaceAll('-', '');
}

export function plannedMealsAsIcs(weekStart: string, weekEnd: string): string {
  const events = listPlannedMeals(weekStart, weekEnd).flatMap((meal) => {
    const description = [
      `${meal.servings} servings`,
      meal.note,
      meal.recipeId ? 'Recipe planned in Bòrd.' : 'Free-form household meal.',
    ]
      .filter(Boolean)
      .join('\n');
    return [
      'BEGIN:VEVENT',
      `UID:${meal.id}@bord.local`,
      `DTSTART;VALUE=DATE:${icsDate(meal.plannedFor)}`,
      `DTEND;VALUE=DATE:${icsDate(addDays(meal.plannedFor, 1))}`,
      `SUMMARY:${icsEscape(`${meal.meal}: ${meal.recipeTitle}`)}`,
      `DESCRIPTION:${icsEscape(description)}`,
      'END:VEVENT',
    ];
  });
  return [
    'BEGIN:VCALENDAR',
    'VERSION:2.0',
    'PRODID:-//Bord//Meal Plan//EN',
    'CALSCALE:GREGORIAN',
    ...events,
    'END:VCALENDAR',
    '',
  ].join('\r\n');
}

export function removeMealPlanEntry(
  entryId: string,
  actorProfileId: string,
  onChanged?: MealPlanEntryChanged,
): void {
  ensureDatabase();
  const database = getDatabase();
  database.transaction((transaction) => {
    const existing = transaction
      .select()
      .from(mealPlanEntries)
      .where(eq(mealPlanEntries.id, entryId))
      .get();
    if (!existing) throw new PlanningNotFoundError('That planned meal no longer exists.');
    onChanged?.(transaction, existing, null);
    const allocation = transaction
      .select({ id: nutritionMealAllocationVersions.id })
      .from(nutritionMealAllocationVersions)
      .where(eq(nutritionMealAllocationVersions.mealPlanEntryId, entryId))
      .limit(1)
      .get();
    if (allocation) {
      transaction
        .update(mealPlanEntries)
        .set({ status: 'cancelled', updatedByProfileId: actorProfileId, updatedAt: new Date() })
        .where(eq(mealPlanEntries.id, entryId))
        .run();
      return;
    }
    transaction.delete(mealPlanEntries).where(eq(mealPlanEntries.id, entryId)).run();
  });
}

function numericServings(value: string): number | null {
  const parsed = Number.parseFloat(value);
  return Number.isFinite(parsed) && parsed > 0 ? parsed : null;
}

type GeneratedItem = {
  quantity: number | null;
  unit: string;
  item: string;
  note: string;
  sourceRecipeIds: Set<string>;
};

export function generateShoppingList(
  weekStart: string,
  weekEnd: string,
  actorProfileId: string,
): ShoppingListDetail {
  ensureDatabase();
  const plannedMeals = listPlannedMeals(weekStart, weekEnd);
  if (!plannedMeals.length)
    throw new PlanningNotFoundError('Plan at least one meal before generating a shopping list.');
  const combined = new Map<string, GeneratedItem>();

  plannedMeals.forEach((plannedMeal, sourceIndex) => {
    if (!plannedMeal.recipeId) return;
    const snapshot = parseMealPlanIngredientSnapshot(plannedMeal.recipeIngredientsSnapshot);
    const recipe = snapshot ? null : getRecipe(plannedMeal.recipeId);
    if (!snapshot && !recipe) return;
    const recipeServings = numericServings(snapshot?.baseServings ?? recipe!.servings);
    const multiplier = recipeServings ? plannedMeal.servings / recipeServings : 1;
    const ingredients =
      snapshot?.ingredients ?? recipe!.ingredientGroups.flatMap((group) => group.ingredients);
    ingredients.forEach((ingredient, itemIndex) => {
      const quantity =
        ingredient.quantity === null ? null : Number((ingredient.quantity * multiplier).toFixed(3));
      const baseKey = [
        ingredient.unit.toLocaleLowerCase(),
        ingredient.item.toLocaleLowerCase(),
        ingredient.note.toLocaleLowerCase(),
      ].join('|');
      const key = quantity === null ? `${baseKey}|${sourceIndex}|${itemIndex}` : baseKey;
      const existing = combined.get(key);
      if (existing) {
        existing.quantity =
          existing.quantity === null || quantity === null
            ? null
            : Number((existing.quantity + quantity).toFixed(3));
        existing.sourceRecipeIds.add(plannedMeal.recipeId!);
      } else {
        combined.set(key, {
          quantity,
          unit: ingredient.unit,
          item: ingredient.item,
          note: ingredient.note,
          sourceRecipeIds: new Set([plannedMeal.recipeId!]),
        });
      }
    });
  });

  const now = new Date();
  const listId = randomUUID();
  const db = getDatabase();
  const supermarketProfileId = getListSettings().defaultSupermarketProfileId;
  db.transaction(() => {
    db.insert(shoppingLists)
      .values({
        id: listId,
        name: `Week of ${weekStart}`,
        weekStart,
        weekEnd,
        supermarketProfileId,
        createdByProfileId: actorProfileId,
        createdAt: now,
        updatedAt: now,
      })
      .run();
    [...combined.values()]
      .sort((a, b) => a.item.localeCompare(b.item))
      .forEach((item, position) => {
        db.insert(shoppingListItems)
          .values({
            id: randomUUID(),
            listId,
            position,
            quantity: item.quantity,
            unit: item.unit,
            item: item.item,
            note: item.note,
            aisleId: resolveShoppingAisle(supermarketProfileId, { item: item.item }, db),
            checked: false,
            shoppingState: 'to_buy',
            sourceRecipeIds: JSON.stringify([...item.sourceRecipeIds]),
            createdAt: now,
            updatedAt: now,
          })
          .run();
      });
  });
  return getShoppingList(listId) as ShoppingListDetail;
}

export function listShoppingLists(includeArchived = false): ShoppingListSummary[] {
  ensureDatabase();
  const database = getDatabase();
  const profiles = new Map(listSupermarketProfiles(true).map((profile) => [profile.id, profile]));
  return database
    .select()
    .from(shoppingLists)
    .orderBy(desc(shoppingLists.createdAt))
    .all()
    .filter((list) => includeArchived || list.archivedAt === null)
    .map((list) => {
      const items = database
        .select({ checked: shoppingListItems.checked })
        .from(shoppingListItems)
        .where(eq(shoppingListItems.listId, list.id))
        .all();
      const profile = list.supermarketProfileId
        ? (profiles.get(list.supermarketProfileId) ?? null)
        : null;
      return {
        ...list,
        itemCount: items.length,
        checkedCount: items.filter((item) => item.checked).length,
        supermarketName: profile?.name ?? null,
        supermarketLocation: profile?.locationLabel ?? '',
      };
    });
}

export function createManualShoppingList(name: string, actorProfileId: string): ShoppingListDetail {
  ensureDatabase();
  const now = new Date();
  const id = randomUUID();
  getDatabase()
    .insert(shoppingLists)
    .values({
      id,
      name,
      weekStart: '',
      weekEnd: '',
      sourceMode: 'manual',
      sourceKey: null,
      archivedAt: null,
      supermarketProfileId: getListSettings().defaultSupermarketProfileId,
      createdByProfileId: actorProfileId,
      createdAt: now,
      updatedAt: now,
    })
    .run();
  return getShoppingList(id)!;
}

export function manageShoppingList(
  listId: string,
  action: { action: 'rename'; name: string } | { action: 'archive' | 'restore' | 'duplicate' },
  actorProfileId: string,
) {
  ensureDatabase();
  const database = getDatabase();
  const list = database.select().from(shoppingLists).where(eq(shoppingLists.id, listId)).get();
  if (!list) throw new PlanningNotFoundError('That shopping list no longer exists.');
  if (action.action === 'rename') {
    database
      .update(shoppingLists)
      .set({ name: action.name, updatedAt: new Date() })
      .where(eq(shoppingLists.id, listId))
      .run();
    return getShoppingList(listId)!;
  }
  if (action.action === 'archive' || action.action === 'restore') {
    database
      .update(shoppingLists)
      .set({ archivedAt: action.action === 'archive' ? new Date() : null, updatedAt: new Date() })
      .where(eq(shoppingLists.id, listId))
      .run();
    return getShoppingList(listId)!;
  }
  const duplicateId = randomUUID();
  database.transaction((transaction) => {
    const now = new Date();
    transaction
      .insert(shoppingLists)
      .values({
        ...list,
        id: duplicateId,
        name: `Copy of ${list.name}`.slice(0, 120),
        sourceMode: 'manual',
        sourceKey: null,
        archivedAt: null,
        createdByProfileId: actorProfileId,
        createdAt: now,
        updatedAt: now,
      })
      .run();
    const items = transaction
      .select()
      .from(shoppingListItems)
      .where(eq(shoppingListItems.listId, listId))
      .orderBy(asc(shoppingListItems.position))
      .all();
    for (const item of items) {
      const nextItemId = randomUUID();
      transaction
        .insert(shoppingListItems)
        .values({ ...item, id: nextItemId, listId: duplicateId, createdAt: now, updatedAt: now })
        .run();
      const pantry = transaction
        .select()
        .from(pantryShoppingItemDetails)
        .where(eq(pantryShoppingItemDetails.shoppingListItemId, item.id))
        .get();
      if (pantry) {
        transaction
          .insert(pantryShoppingItemDetails)
          .values({
            ...pantry,
            shoppingListItemId: nextItemId,
            generationKey: `duplicate:${duplicateId}:${pantry.generationKey}`,
            generatedAt: now,
            updatedAt: now,
          })
          .run();
      }
    }
  });
  return getShoppingList(duplicateId)!;
}

export function deleteShoppingList(listId: string): void {
  ensureDatabase();
  const database = getDatabase();
  const itemIds = database
    .select({ id: shoppingListItems.id })
    .from(shoppingListItems)
    .where(eq(shoppingListItems.listId, listId))
    .all()
    .map(({ id }) => id);
  if (
    !database
      .select({ id: shoppingLists.id })
      .from(shoppingLists)
      .where(eq(shoppingLists.id, listId))
      .get()
  ) {
    throw new PlanningNotFoundError('That shopping list no longer exists.');
  }
  if (
    itemIds.length &&
    database
      .select({ id: pantryPurchaseIntakes.id })
      .from(pantryPurchaseIntakes)
      .where(inArray(pantryPurchaseIntakes.shoppingListItemId, itemIds))
      .get()
  ) {
    throw new PlanningNotFoundError(
      'Archive this list instead because it has Pantry purchase history.',
    );
  }
  database.delete(shoppingLists).where(eq(shoppingLists.id, listId)).run();
}

export function getShoppingList(listId: string): ShoppingListDetail | null {
  ensureDatabase();
  const list = getDatabase().select().from(shoppingLists).where(eq(shoppingLists.id, listId)).get();
  if (!list) return null;
  const items = getDatabase()
    .select()
    .from(shoppingListItems)
    .where(eq(shoppingListItems.listId, listId))
    .orderBy(asc(shoppingListItems.position))
    .all();
  const pantryDetails = getShoppingItemPantryDetails(items.map((item) => item.id));
  return {
    ...list,
    aisles: list.supermarketProfileId
      ? listAislesForSupermarket(list.supermarketProfileId)
      : listShoppingAisles(),
    settings: getListSettings(),
    supermarketProfile: getSupermarketProfile(list.supermarketProfileId),
    supermarketProfiles: listSupermarketProfiles(false),
    items: items
      .map((item) => ({ ...item, pantry: pantryDetails.get(item.id) ?? null }))
      .filter(
        (item) =>
          !item.pantry ||
          item.pantry.generationMode === 'all' ||
          item.pantry.demandState === 'uncertain' ||
          item.pantry.demandState === 'manual' ||
          item.pantry.shortageQuantity !== 0,
      ),
  };
}

export function listShoppingAisles(): Array<typeof shoppingAisles.$inferSelect> {
  ensureDatabase();
  return getDatabase().select().from(shoppingAisles).orderBy(asc(shoppingAisles.position)).all();
}

function aisleIdOrNull(aisleId: string): string | null {
  if (!aisleId) return null;
  const aisle = getDatabase()
    .select({ id: shoppingAisles.id })
    .from(shoppingAisles)
    .where(eq(shoppingAisles.id, aisleId))
    .get();
  if (!aisle) throw new PlanningNotFoundError('That shopping aisle no longer exists.');
  return aisle.id;
}

export function createShoppingAisle(input: ShoppingAisleInput): typeof shoppingAisles.$inferSelect {
  ensureDatabase();
  const db = getDatabase();
  if (
    db
      .select({ id: shoppingAisles.id })
      .from(shoppingAisles)
      .where(eq(shoppingAisles.name, input.name))
      .get()
  )
    throw new PlanningNotFoundError('That shopping aisle already exists.');
  const last = db
    .select({ position: shoppingAisles.position })
    .from(shoppingAisles)
    .orderBy(desc(shoppingAisles.position))
    .limit(1)
    .get();
  const now = new Date();
  const aisle = {
    id: randomUUID(),
    name: input.name,
    position: (last?.position ?? -1) + 1,
    createdAt: now,
    updatedAt: now,
  };
  db.insert(shoppingAisles).values(aisle).run();
  return aisle;
}

export function reorderShoppingAisles(aisleIds: string[]): void {
  ensureDatabase();
  const current = listShoppingAisles();
  if (current.length !== aisleIds.length || current.some((aisle) => !aisleIds.includes(aisle.id)))
    throw new PlanningNotFoundError('Use the current set of shopping aisles.');
  const db = getDatabase();
  db.transaction(() =>
    aisleIds.forEach((id, position) =>
      db
        .update(shoppingAisles)
        .set({ position, updatedAt: new Date() })
        .where(eq(shoppingAisles.id, id))
        .run(),
    ),
  );
}

export function removeShoppingAisle(aisleId: string): void {
  ensureDatabase();
  const result = getDatabase().delete(shoppingAisles).where(eq(shoppingAisles.id, aisleId)).run();
  if (!result.changes) throw new PlanningNotFoundError('That shopping aisle no longer exists.');
}

function parsedJsonObject(value: string): Record<string, unknown> {
  try {
    const parsed = JSON.parse(value);
    return parsed && typeof parsed === 'object' && !Array.isArray(parsed) ? parsed : {};
  } catch {
    return {};
  }
}

export function addShoppingListItem(
  listId: string,
  input: ShoppingListItemInput,
  actorProfileId?: string,
): typeof shoppingListItems.$inferSelect {
  ensureDatabase();
  const list = getDatabase().select().from(shoppingLists).where(eq(shoppingLists.id, listId)).get();
  if (!list) throw new PlanningNotFoundError('That shopping list no longer exists.');
  const db = getDatabase();
  if (input.productId) {
    const existing = db
      .select({ item: shoppingListItems, pantry: pantryShoppingItemDetails })
      .from(shoppingListItems)
      .innerJoin(
        pantryShoppingItemDetails,
        eq(pantryShoppingItemDetails.shoppingListItemId, shoppingListItems.id),
      )
      .where(
        and(
          eq(shoppingListItems.listId, listId),
          eq(pantryShoppingItemDetails.productId, input.productId),
        ),
      )
      .get();
    if (existing) {
      const formula = parsedJsonObject(existing.pantry.formulaInputs);
      if (input.recommendationKey && formula.recommendationKey === input.recommendationKey) {
        return existing.item;
      }
      const quantity = input.quantity === '' ? null : input.quantity;
      const compatible =
        quantity !== null &&
        existing.item.quantity !== null &&
        existing.item.unit.toLocaleLowerCase() === input.unit.toLocaleLowerCase();
      const mergedQuantity = compatible
        ? Number((existing.item.quantity! + quantity).toFixed(6))
        : existing.item.quantity;
      const provenance = parsedJsonObject(existing.pantry.provenance);
      const recommendationKeys = [
        ...new Set(
          [
            ...(Array.isArray(provenance.recommendationKeys)
              ? provenance.recommendationKeys.filter(
                  (value): value is string => typeof value === 'string',
                )
              : []),
            typeof provenance.recommendationKey === 'string' ? provenance.recommendationKey : null,
            input.recommendationKey ?? null,
          ].filter((value): value is string => Boolean(value)),
        ),
      ];
      db.transaction((transaction) => {
        transaction
          .update(shoppingListItems)
          .set({
            quantity: mergedQuantity,
            note: [
              existing.item.note,
              input.note,
              compatible || quantity === null ? '' : `Review additional ${quantity} ${input.unit}`,
            ]
              .filter(Boolean)
              .join(' · ')
              .slice(0, 240),
            updatedAt: new Date(),
          })
          .where(eq(shoppingListItems.id, existing.item.id))
          .run();
        transaction
          .update(pantryShoppingItemDetails)
          .set({
            generatedQuantity: compatible ? mergedQuantity : existing.pantry.generatedQuantity,
            shortageQuantity: compatible ? mergedQuantity : existing.pantry.shortageQuantity,
            formulaInputs: JSON.stringify({
              ...formula,
              recommendationKeys,
            }),
            provenance: JSON.stringify({ ...provenance, recommendationKeys }),
            updatedAt: new Date(),
          })
          .where(eq(pantryShoppingItemDetails.shoppingListItemId, existing.item.id))
          .run();
      });
      return db
        .select()
        .from(shoppingListItems)
        .where(eq(shoppingListItems.id, existing.item.id))
        .get()!;
    }
  }
  const lastItem = db
    .select({ position: shoppingListItems.position })
    .from(shoppingListItems)
    .where(eq(shoppingListItems.listId, listId))
    .orderBy(desc(shoppingListItems.position))
    .limit(1)
    .get();
  const now = new Date();
  const item: typeof shoppingListItems.$inferInsert = {
    id: randomUUID(),
    listId,
    position: (lastItem?.position ?? -1) + 1,
    quantity: input.quantity === '' ? null : input.quantity,
    unit: input.unit,
    item: input.item,
    note: input.note,
    aisleId:
      input.aisleId === undefined
        ? resolveShoppingAisle(list.supermarketProfileId, { item: input.item }, db)
        : aisleIdOrNull(input.aisleId),
    checked: input.checked,
    shoppingState: input.checked ? 'sourced' : (input.shoppingState ?? 'to_buy'),
    sourceRecipeIds: JSON.stringify(input.recipeId ? [input.recipeId] : []),
    createdAt: now,
    updatedAt: now,
  };
  db.transaction((transaction) => {
    transaction.insert(shoppingListItems).values(item).run();
    if (input.productId) {
      transaction
        .insert(pantryShoppingItemDetails)
        .values({
          shoppingListItemId: item.id,
          productId: input.productId,
          demandState: 'manual',
          generatedQuantity: input.quantity === '' ? null : input.quantity,
          generatedUnit: input.unit,
          shortageQuantity: input.quantity === '' ? null : input.quantity,
          uncertaintyReason: null,
          formulaInputs: JSON.stringify({
            source: 'nutrition_recommendation',
            recommendationKey: input.recommendationKey ?? null,
          }),
          provenance: JSON.stringify({
            source: 'nutrition_recommendation',
            recommendationKey: input.recommendationKey ?? null,
            recipeId: input.recipeId ?? null,
            productId: input.productId,
            actorProfileId: actorProfileId ?? null,
          }),
          generationKey: `nutrition:${input.recommendationKey ?? item.id}:${input.productId}`,
          manualQuantityOverride: false,
          manualUnitOverride: false,
          manualItemOverride: false,
          manualNoteOverride: false,
          generationMode: 'missing',
          coverageState: 'active',
          manualExtraQuantity: 0,
          manualExtraUnit: '',
          coveredQuantity: 0,
          coveredUnit: '',
          purchasedQuantity: 0,
          purchasedUnit: '',
          controlNote: '',
          generatedAt: now,
          updatedAt: now,
        })
        .run();
    }
  });
  if (actorProfileId && input.aisleId !== undefined)
    rememberShoppingAisle(
      list.supermarketProfileId,
      input.item,
      input.productId ?? null,
      item.aisleId ?? null,
      actorProfileId,
      db,
    );
  return db.select().from(shoppingListItems).where(eq(shoppingListItems.id, item.id)).get()!;
}

export function updateShoppingListItem(
  listId: string,
  itemId: string,
  input: ShoppingListItemInput,
  actorProfileId?: string,
): void {
  ensureDatabase();
  getDatabase().transaction((transaction) => {
    const previous = transaction
      .select()
      .from(shoppingListItems)
      .where(and(eq(shoppingListItems.id, itemId), eq(shoppingListItems.listId, listId)))
      .get();
    if (!previous) throw new PlanningNotFoundError('That shopping-list item no longer exists.');
    const list = transaction.select().from(shoppingLists).where(eq(shoppingLists.id, listId)).get();
    if (!list) throw new PlanningNotFoundError('That shopping list no longer exists.');
    const next = {
      quantity: input.quantity === '' ? null : input.quantity,
      unit: input.unit,
      item: input.item,
      note: input.note,
    };
    const result = transaction
      .update(shoppingListItems)
      .set({
        ...next,
        aisleId:
          input.aisleId === undefined
            ? resolveShoppingAisle(list.supermarketProfileId, { item: input.item }, transaction)
            : aisleIdOrNull(input.aisleId),
        checked: input.checked,
        shoppingState:
          input.checked || input.shoppingState === 'sourced'
            ? 'sourced'
            : (input.shoppingState ?? 'to_buy'),
        updatedAt: new Date(),
      })
      .where(and(eq(shoppingListItems.id, itemId), eq(shoppingListItems.listId, listId)))
      .run();
    if (!result.changes)
      throw new PlanningNotFoundError('That shopping-list item no longer exists.');
    recordShoppingItemManualOverrides(itemId, previous, next, transaction);
    if (actorProfileId && input.aisleId !== undefined)
      rememberShoppingAisle(
        list.supermarketProfileId,
        input.item,
        getShoppingListProductId(itemId),
        aisleIdOrNull(input.aisleId),
        actorProfileId,
        transaction,
      );
  });
}

export function createRetryShoppingList(
  sourceListId: string,
  supermarketProfileId: string,
  actorProfileId: string,
): ShoppingListDetail {
  ensureDatabase();
  const database = getDatabase();
  const source = database
    .select()
    .from(shoppingLists)
    .where(eq(shoppingLists.id, sourceListId))
    .get();
  if (!source) throw new PlanningNotFoundError('That shopping list no longer exists.');
  if (source.supermarketProfileId === supermarketProfileId)
    throw new PlanningNotFoundError('Choose a different supermarket for these items.');
  const profile = getSupermarketProfile(supermarketProfileId, false);
  if (!profile) throw new PlanningNotFoundError('Choose an active supermarket profile.');

  const missing = database
    .select({ item: shoppingListItems, pantry: pantryShoppingItemDetails })
    .from(shoppingListItems)
    .leftJoin(
      pantryShoppingItemDetails,
      eq(pantryShoppingItemDetails.shoppingListItemId, shoppingListItems.id),
    )
    .where(
      and(
        eq(shoppingListItems.listId, sourceListId),
        eq(shoppingListItems.shoppingState, 'cant_find'),
      ),
    )
    .all();
  if (!missing.length)
    throw new PlanningNotFoundError('Mark at least one item as can’t find first.');

  const sectionPosition = new Map(
    profile.sections.map((section) => [section.aisleId, section.position]),
  );
  const routed = missing
    .map((entry) => ({
      ...entry,
      aisleId: resolveShoppingAisle(
        supermarketProfileId,
        { item: entry.item.item, productId: entry.pantry?.productId ?? null },
        database,
      ),
    }))
    .sort(
      (left, right) =>
        (sectionPosition.get(left.aisleId ?? '') ?? Number.MAX_SAFE_INTEGER) -
          (sectionPosition.get(right.aisleId ?? '') ?? Number.MAX_SAFE_INTEGER) ||
        left.item.item.localeCompare(right.item.item),
    );

  const now = new Date();
  const listId = randomUUID();
  database.transaction((transaction) => {
    transaction
      .insert(shoppingLists)
      .values({
        id: listId,
        name: `${source.name} · ${profile.name}`.slice(0, 120),
        weekStart: '',
        weekEnd: '',
        sourceMode: 'manual',
        sourceKey: null,
        archivedAt: null,
        supermarketProfileId,
        createdByProfileId: actorProfileId,
        createdAt: now,
        updatedAt: now,
      })
      .run();
    routed.forEach((entry, position) => {
      const itemId = randomUUID();
      transaction
        .insert(shoppingListItems)
        .values({
          ...entry.item,
          id: itemId,
          listId,
          position,
          aisleId: entry.aisleId,
          checked: false,
          shoppingState: 'to_buy',
          createdAt: now,
          updatedAt: now,
        })
        .run();
      if (entry.pantry) {
        transaction
          .insert(pantryShoppingItemDetails)
          .values({
            ...entry.pantry,
            shoppingListItemId: itemId,
            generationKey: `retry:${listId}:${entry.pantry.generationKey}`,
            generatedAt: now,
            updatedAt: now,
          })
          .run();
      }
    });
  });
  return getShoppingList(listId)!;
}

export function removeShoppingListItem(listId: string, itemId: string): void {
  ensureDatabase();
  const result = getDatabase()
    .delete(shoppingListItems)
    .where(and(eq(shoppingListItems.id, itemId), eq(shoppingListItems.listId, listId)))
    .run();
  if (!result.changes) throw new PlanningNotFoundError('That shopping-list item no longer exists.');
}

export function reorderShoppingListItems(listId: string, itemIds: string[]): void {
  ensureDatabase();
  const current = getShoppingList(listId);
  if (
    !current ||
    current.items.length !== itemIds.length ||
    current.items.some((item) => !itemIds.includes(item.id))
  )
    throw new PlanningNotFoundError('Use the current list item order.');
  const db = getDatabase();
  db.transaction(() =>
    itemIds.forEach((itemId, position) =>
      db
        .update(shoppingListItems)
        .set({ position, updatedAt: new Date() })
        .where(and(eq(shoppingListItems.id, itemId), eq(shoppingListItems.listId, listId)))
        .run(),
    ),
  );
}
