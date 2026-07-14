import { and, asc, desc, eq, gte, inArray, lte } from 'drizzle-orm';
import { randomUUID } from 'node:crypto';

import { getDatabase, ensureDatabase } from '@/lib/db/client';
import {
  mealPlanEntries,
  recipes,
  shoppingAisles,
  shoppingListItems,
  shoppingLists,
} from '@/lib/db/schema';
import type {
  DuplicateWeekInput,
  MealPlanEntryInput,
  ShoppingAisleInput,
  ShoppingListItemInput,
} from '@/lib/domain/planning';
import { getRecipe } from '@/lib/services/recipe-service';

export class PlanningNotFoundError extends Error {}

export type PlannedMeal = typeof mealPlanEntries.$inferSelect & { recipeTitle: string };
export type ShoppingListDetail = typeof shoppingLists.$inferSelect & {
  items: Array<typeof shoppingListItems.$inferSelect>;
  aisles: Array<typeof shoppingAisles.$inferSelect>;
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
        .select({ id: recipes.id, title: recipes.title })
        .from(recipes)
        .where(inArray(recipes.id, recipeIds))
        .all()
    : [];
  return entries.map((entry) => ({
    ...entry,
    recipeTitle: entry.recipeId
      ? (titles.find((recipe) => recipe.id === entry.recipeId)?.title ?? 'Deleted recipe')
      : entry.title,
  }));
}

export function addMealPlanEntry(input: MealPlanEntryInput, actorProfileId: string): PlannedMeal {
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
    title,
    servings: input.servings,
    note: input.note,
    createdByProfileId: actorProfileId,
    updatedByProfileId: actorProfileId,
    createdAt: now,
    updatedAt: now,
  };
  getDatabase().insert(mealPlanEntries).values(entry).run();
  return {
    ...entry,
    recipeId: entry.recipeId ?? null,
    title: entry.title ?? '',
    recipeTitle: recipe?.title ?? title,
  };
}

function addDays(isoDate: string, days: number): string {
  const value = new Date(`${isoDate}T12:00:00Z`);
  value.setUTCDate(value.getUTCDate() + days);
  return value.toISOString().slice(0, 10);
}

export function duplicateWeek(input: DuplicateWeekInput, actorProfileId: string): PlannedMeal[] {
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
    title: entry.title,
    servings: entry.servings,
    note: entry.note,
    createdByProfileId: actorProfileId,
    updatedByProfileId: actorProfileId,
    createdAt: now,
    updatedAt: now,
  }));
  if (entries.length)
    getDatabase().transaction(() => getDatabase().insert(mealPlanEntries).values(entries).run());
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
      meal.recipeId ? 'Recipe planned in Our Recipes.' : 'Free-form household meal.',
    ]
      .filter(Boolean)
      .join('\n');
    return [
      'BEGIN:VEVENT',
      `UID:${meal.id}@our-recipes.local`,
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
    'PRODID:-//Our Recipes//Meal Plan//EN',
    'CALSCALE:GREGORIAN',
    ...events,
    'END:VCALENDAR',
    '',
  ].join('\r\n');
}

export function removeMealPlanEntry(entryId: string): void {
  ensureDatabase();
  const result = getDatabase().delete(mealPlanEntries).where(eq(mealPlanEntries.id, entryId)).run();
  if (!result.changes) throw new PlanningNotFoundError('That planned meal no longer exists.');
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
    const recipe = getRecipe(plannedMeal.recipeId);
    if (!recipe) return;
    const recipeServings = numericServings(recipe.servings);
    const multiplier = recipeServings ? plannedMeal.servings / recipeServings : 1;
    recipe.ingredientGroups
      .flatMap((group) => group.ingredients)
      .forEach((ingredient, itemIndex) => {
        const quantity =
          ingredient.quantity === null
            ? null
            : Number((ingredient.quantity * multiplier).toFixed(3));
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
          existing.sourceRecipeIds.add(recipe.id);
        } else {
          combined.set(key, {
            quantity,
            unit: ingredient.unit,
            item: ingredient.item,
            note: ingredient.note,
            sourceRecipeIds: new Set([recipe.id]),
          });
        }
      });
  });

  const now = new Date();
  const listId = randomUUID();
  const db = getDatabase();
  db.transaction(() => {
    db.insert(shoppingLists)
      .values({
        id: listId,
        name: `Week of ${weekStart}`,
        weekStart,
        weekEnd,
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
            aisleId: null,
            checked: false,
            sourceRecipeIds: JSON.stringify([...item.sourceRecipeIds]),
            createdAt: now,
            updatedAt: now,
          })
          .run();
      });
  });
  return getShoppingList(listId) as ShoppingListDetail;
}

export function listShoppingLists(): Array<typeof shoppingLists.$inferSelect> {
  ensureDatabase();
  return getDatabase().select().from(shoppingLists).orderBy(desc(shoppingLists.createdAt)).all();
}

export function getShoppingList(listId: string): ShoppingListDetail | null {
  ensureDatabase();
  const list = getDatabase().select().from(shoppingLists).where(eq(shoppingLists.id, listId)).get();
  if (!list) return null;
  return {
    ...list,
    aisles: listShoppingAisles(),
    items: getDatabase()
      .select()
      .from(shoppingListItems)
      .where(eq(shoppingListItems.listId, listId))
      .orderBy(asc(shoppingListItems.position))
      .all(),
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

export function addShoppingListItem(
  listId: string,
  input: ShoppingListItemInput,
): typeof shoppingListItems.$inferSelect {
  ensureDatabase();
  if (!getShoppingList(listId))
    throw new PlanningNotFoundError('That shopping list no longer exists.');
  const db = getDatabase();
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
    aisleId: aisleIdOrNull(input.aisleId ?? ''),
    checked: input.checked,
    sourceRecipeIds: '[]',
    createdAt: now,
    updatedAt: now,
  };
  db.insert(shoppingListItems).values(item).run();
  return db.select().from(shoppingListItems).where(eq(shoppingListItems.id, item.id)).get()!;
}

export function updateShoppingListItem(
  listId: string,
  itemId: string,
  input: ShoppingListItemInput,
): void {
  ensureDatabase();
  const result = getDatabase()
    .update(shoppingListItems)
    .set({
      quantity: input.quantity === '' ? null : input.quantity,
      unit: input.unit,
      item: input.item,
      note: input.note,
      aisleId: aisleIdOrNull(input.aisleId ?? ''),
      checked: input.checked,
      updatedAt: new Date(),
    })
    .where(and(eq(shoppingListItems.id, itemId), eq(shoppingListItems.listId, listId)))
    .run();
  if (!result.changes) throw new PlanningNotFoundError('That shopping-list item no longer exists.');
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
