import { timingSafeEqual } from 'node:crypto';

import { getRuntimeConfig } from '@/lib/config';
import { ensureDatabase } from '@/lib/db/client';
import { listProfiles } from '@/lib/services/household-service';
import {
  getShoppingList,
  listPlannedMeals,
  listShoppingLists,
} from '@/lib/services/planning-service';
import { getRecipe } from '@/lib/services/recipe-service';

type MealSlot = 'breakfast' | 'lunch' | 'dinner' | 'snack';

type ZonedDateTime = {
  date: string;
  hour: number;
  minute: number;
};

const mealSchedule: Record<MealSlot, { hour: number; minute: number; order: number }> = {
  breakfast: { hour: 8, minute: 0, order: 0 },
  lunch: { hour: 12, minute: 30, order: 1 },
  snack: { hour: 15, minute: 0, order: 2 },
  dinner: { hour: 18, minute: 30, order: 3 },
};

export type HomepageIntegrationSummary = {
  generatedAt: string;
  nextMeal: {
    date: string;
    slot: MealSlot;
    title: string;
    recipeUrl: string | null;
    imageUrl: string | null;
    servings: number;
    scheduledFor: string;
  } | null;
  groceryList: {
    title: string;
    updatedAt: string;
    totalItems: number;
    remainingItems: number;
    items: Array<{ name: string; quantity: string; category: string }>;
  } | null;
};

function zonedDateTime(value: Date, timeZone: string): ZonedDateTime {
  const parts = new Intl.DateTimeFormat('en-US', {
    timeZone,
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
    hour: '2-digit',
    minute: '2-digit',
    hourCycle: 'h23',
  }).formatToParts(value);
  const fields = Object.fromEntries(
    parts.filter((part) => part.type !== 'literal').map((part) => [part.type, part.value]),
  );
  return {
    date: `${fields.year}-${fields.month}-${fields.day}`,
    hour: Number(fields.hour),
    minute: Number(fields.minute),
  };
}

function offsetForDate(date: string, timeZone: string): string {
  const midday = new Date(`${date}T12:00:00.000Z`);
  const name = new Intl.DateTimeFormat('en-US', {
    timeZone,
    timeZoneName: 'longOffset',
  })
    .formatToParts(midday)
    .find((part) => part.type === 'timeZoneName')?.value;
  return name && name !== 'GMT' ? name.replace('GMT', '') : 'Z';
}

function localScheduledTime(date: string, slot: MealSlot, timeZone: string): string {
  const schedule = mealSchedule[slot];
  return `${date}T${String(schedule.hour).padStart(2, '0')}:${String(schedule.minute).padStart(2, '0')}:00${offsetForDate(date, timeZone)}`;
}

function mealHasNotStarted(slot: MealSlot, now: ZonedDateTime): boolean {
  const schedule = mealSchedule[slot];
  return schedule.hour > now.hour || (schedule.hour === now.hour && schedule.minute >= now.minute);
}

function formatQuantity(quantity: number | null, unit: string, locale: string): string {
  const value =
    quantity === null
      ? ''
      : new Intl.NumberFormat(locale, { maximumFractionDigits: 3 }).format(quantity);
  return [value, unit].filter(Boolean).join(' ');
}

function selectRelevantShoppingList(today: string) {
  const lists = listShoppingLists();
  const current = lists.find((list) => list.weekStart <= today && list.weekEnd >= today);
  if (current) return current;

  const next = [...lists]
    .filter((list) => list.weekStart > today)
    .sort((first, second) => first.weekStart.localeCompare(second.weekStart))[0];
  if (next) return next;

  return [...lists].sort((first, second) => second.weekEnd.localeCompare(first.weekEnd))[0] ?? null;
}

export function hasHomepageIntegrationToken(): boolean {
  return Boolean(getRuntimeConfig().homepageIntegrationToken);
}

export function hasValidHomepageIntegrationAuthorization(authorization: string | null): boolean {
  const expected = getRuntimeConfig().homepageIntegrationToken;
  if (!expected || !authorization?.startsWith('Bearer ')) return false;
  const received = authorization.slice('Bearer '.length);
  if (received.length !== expected.length) return false;
  return timingSafeEqual(Buffer.from(received), Buffer.from(expected));
}

export function getHomepageIntegrationSummary(now = new Date()): HomepageIntegrationSummary {
  ensureDatabase();
  const config = getRuntimeConfig();
  const profile = listProfiles()[0];
  const timeZone = profile?.timezone ?? 'UTC';
  const locale = profile?.locale ?? 'en-US';
  const localNow = zonedDateTime(now, timeZone);
  const publicOrigin = config.appOrigin ?? 'https://recipes.tower';
  const plannedMeals = listPlannedMeals(localNow.date, '9999-12-31').sort((first, second) => {
    const byDate = first.plannedFor.localeCompare(second.plannedFor);
    return (
      byDate ||
      mealSchedule[first.meal as MealSlot].order - mealSchedule[second.meal as MealSlot].order
    );
  });
  const nextPlannedMeal = plannedMeals.find(
    (meal) => meal.plannedFor > localNow.date || mealHasNotStarted(meal.meal as MealSlot, localNow),
  );
  const recipe = nextPlannedMeal?.recipeId ? getRecipe(nextPlannedMeal.recipeId) : null;
  const image = recipe?.images[0];
  const nextMeal = nextPlannedMeal
    ? {
        date: nextPlannedMeal.plannedFor,
        slot: nextPlannedMeal.meal as MealSlot,
        title: nextPlannedMeal.recipeTitle,
        recipeUrl: recipe ? new URL(`/recipes/${recipe.id}`, publicOrigin).toString() : null,
        imageUrl:
          recipe && image
            ? new URL(`/api/v1/recipes/${recipe.id}/images/${image.id}`, publicOrigin).toString()
            : null,
        servings: nextPlannedMeal.servings,
        scheduledFor: localScheduledTime(
          nextPlannedMeal.plannedFor,
          nextPlannedMeal.meal as MealSlot,
          timeZone,
        ),
      }
    : null;

  const shoppingList = selectRelevantShoppingList(localNow.date);
  const shoppingListDetail = shoppingList ? getShoppingList(shoppingList.id) : null;
  const aisleNames = new Map(shoppingListDetail?.aisles.map((aisle) => [aisle.id, aisle.name]));
  const remainingItems = shoppingListDetail?.items.filter((item) => !item.checked) ?? [];
  const latestUpdate = shoppingListDetail?.items.reduce(
    (latest, item) => (item.updatedAt > latest ? item.updatedAt : latest),
    shoppingListDetail.updatedAt,
  );

  return {
    generatedAt: now.toISOString(),
    nextMeal,
    groceryList: shoppingListDetail
      ? {
          title: shoppingListDetail.name,
          updatedAt: (latestUpdate ?? shoppingListDetail.updatedAt).toISOString(),
          totalItems: shoppingListDetail.items.length,
          remainingItems: remainingItems.length,
          items: remainingItems.slice(0, 5).map((item) => ({
            name: item.note ? `${item.item} (${item.note})` : item.item,
            quantity: formatQuantity(item.quantity, item.unit, locale),
            category: (item.aisleId && aisleNames.get(item.aisleId)) ?? 'Uncategorized',
          })),
        }
      : null,
  };
}
