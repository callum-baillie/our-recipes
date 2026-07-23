import 'server-only';

import { asc, eq, gte } from 'drizzle-orm';

import { ensureDatabase, getDatabase } from '@/lib/db/client';
import { mealPlanEntries, recipeImages, recipes } from '@/lib/db/schema';
import { formatScaledQuantity } from '@/lib/domain/ingredient-scaling';
import { getHouseholdState } from '@/lib/services/household-service';
import { getShoppingList, listShoppingLists } from '@/lib/services/planning-service';

const PUBLIC_RECIPE_ORIGIN = 'https://recipes.tower';

const MEAL_SLOT_HOURS: Record<string, number> = {
  breakfast: 8,
  brunch: 10,
  lunch: 12,
  dinner: 18,
  supper: 20,
  dessert: 20,
  snack: 15,
  tiffin: 15,
  suhoor: 5,
  iftar: 19,
};

type MealSlot = string;

function mealSlotHour(slot: MealSlot): number {
  return MEAL_SLOT_HOURS[slot] ?? 12;
}

export type HomepageSummary = {
  generatedAt: string;
  nextMeal: {
    date: string;
    slot: MealSlot;
    title: string;
    recipeUrl: string;
    imageUrl: string | null;
    servings: number;
    scheduledFor: string;
  } | null;
  groceryList: {
    title: string;
    updatedAt: string;
    totalItems: number;
    remainingItems: number;
    items: Array<{
      name: string;
      quantity: string;
      category: string;
    }>;
  } | null;
};

type ZonedParts = {
  year: number;
  month: number;
  day: number;
  hour: number;
  minute: number;
  second: number;
};

function isValidTimeZone(timeZone: string): boolean {
  try {
    new Intl.DateTimeFormat('en-US', { timeZone }).format();
    return true;
  } catch {
    return false;
  }
}

function householdTimeZone(): string {
  // Profiles currently carry the app's timezone preference. The first active
  // household profile is also the setup profile, so it is the stable household
  // fallback until the data model gains a household-level timezone field.
  const profileTimeZone = getHouseholdState().profiles[0]?.timezone;
  if (profileTimeZone && isValidTimeZone(profileTimeZone)) return profileTimeZone;
  if (process.env.TZ && isValidTimeZone(process.env.TZ)) return process.env.TZ;
  return 'UTC';
}

function zonedParts(date: Date, timeZone: string): ZonedParts {
  const values = Object.fromEntries(
    new Intl.DateTimeFormat('en-CA', {
      timeZone,
      hourCycle: 'h23',
      year: 'numeric',
      month: '2-digit',
      day: '2-digit',
      hour: '2-digit',
      minute: '2-digit',
      second: '2-digit',
    })
      .formatToParts(date)
      .filter((part) => part.type !== 'literal')
      .map((part) => [part.type, Number(part.value)]),
  );
  return values as ZonedParts;
}

function timeZoneOffsetMinutes(date: Date, timeZone: string): number {
  const parts = zonedParts(date, timeZone);
  const representedAsUtc = Date.UTC(
    parts.year,
    parts.month - 1,
    parts.day,
    parts.hour,
    parts.minute,
    parts.second,
  );
  const wholeSecondInstant = Math.trunc(date.getTime() / 1_000) * 1_000;
  return Math.round((representedAsUtc - wholeSecondInstant) / 60_000);
}

function scheduledInstant(date: string, slot: MealSlot, timeZone: string): Date {
  const [year, month, day] = date.split('-').map(Number) as [number, number, number];
  const localAsUtc = Date.UTC(year, month - 1, day, mealSlotHour(slot), 0, 0);
  let candidate = new Date(localAsUtc);
  // Re-evaluate after applying the offset so dates close to a DST boundary use
  // the offset at the actual scheduled instant.
  for (let pass = 0; pass < 2; pass += 1) {
    candidate = new Date(localAsUtc - timeZoneOffsetMinutes(candidate, timeZone) * 60_000);
  }
  return candidate;
}

function localIsoDate(date: Date, timeZone: string): string {
  const parts = zonedParts(date, timeZone);
  return [
    parts.year,
    String(parts.month).padStart(2, '0'),
    String(parts.day).padStart(2, '0'),
  ].join('-');
}

function scheduledFor(date: string, slot: MealSlot, instant: Date, timeZone: string): string {
  const offset = timeZoneOffsetMinutes(instant, timeZone);
  const sign = offset >= 0 ? '+' : '-';
  const absoluteOffset = Math.abs(offset);
  const hours = String(Math.floor(absoluteOffset / 60)).padStart(2, '0');
  const minutes = String(absoluteOffset % 60).padStart(2, '0');
  return `${date}T${String(mealSlotHour(slot)).padStart(2, '0')}:00:00${sign}${hours}:${minutes}`;
}

function absoluteUrl(path: string): string {
  return new URL(path, PUBLIC_RECIPE_ORIGIN).toString();
}

function nextMeal(now: Date, timeZone: string): HomepageSummary['nextMeal'] {
  const db = getDatabase();
  const candidates = db
    .select({
      id: mealPlanEntries.id,
      date: mealPlanEntries.plannedFor,
      slot: mealPlanEntries.meal,
      servings: mealPlanEntries.servings,
      createdAt: mealPlanEntries.createdAt,
      recipeId: recipes.id,
      title: recipes.title,
    })
    .from(mealPlanEntries)
    .innerJoin(recipes, eq(mealPlanEntries.recipeId, recipes.id))
    .where(gte(mealPlanEntries.plannedFor, localIsoDate(now, timeZone)))
    .all()
    .map((candidate) => ({
      ...candidate,
      instant: scheduledInstant(candidate.date, candidate.slot, timeZone),
    }))
    .filter((candidate) => candidate.instant.getTime() > now.getTime())
    .sort(
      (left, right) =>
        left.instant.getTime() - right.instant.getTime() ||
        left.createdAt.getTime() - right.createdAt.getTime() ||
        left.id.localeCompare(right.id),
    );

  const meal = candidates[0];
  if (!meal) return null;

  const image = db
    .select({ id: recipeImages.id })
    .from(recipeImages)
    .where(eq(recipeImages.recipeId, meal.recipeId))
    .orderBy(asc(recipeImages.createdAt), asc(recipeImages.id))
    .limit(1)
    .get();

  return {
    date: meal.date,
    slot: meal.slot,
    title: meal.title,
    recipeUrl: absoluteUrl(`/recipes/${encodeURIComponent(meal.recipeId)}`),
    imageUrl: image
      ? absoluteUrl(
          `/api/v1/recipes/${encodeURIComponent(meal.recipeId)}/images/${encodeURIComponent(image.id)}`,
        )
      : null,
    servings: meal.servings,
    scheduledFor: scheduledFor(meal.date, meal.slot, meal.instant, timeZone),
  };
}

function quantityLabel(quantity: number | null, unit: string): string {
  return [quantity === null ? '' : formatScaledQuantity(quantity), unit.trim()]
    .filter(Boolean)
    .join(' ');
}

function currentGroceryList(): HomepageSummary['groceryList'] {
  // The application has no active-list marker; its list UX defines the newest
  // generated list as current by showing lists in descending creation order.
  const current = listShoppingLists()[0];
  if (!current) return null;
  const detail = getShoppingList(current.id);
  if (!detail) return null;

  const aisleNames = new Map(detail.aisles.map((aisle) => [aisle.id, aisle.name]));
  const remaining = detail.items.filter((item) => !item.checked);
  const updatedAt = detail.items.reduce(
    (latest, item) => (item.updatedAt.getTime() > latest.getTime() ? item.updatedAt : latest),
    current.updatedAt,
  );

  return {
    title: current.name,
    updatedAt: updatedAt.toISOString(),
    totalItems: detail.items.length,
    remainingItems: remaining.length,
    items: remaining.slice(0, 5).map((item) => ({
      name: item.item,
      quantity: quantityLabel(item.quantity, item.unit),
      category: item.aisleId ? (aisleNames.get(item.aisleId) ?? 'Unassigned') : 'Unassigned',
    })),
  };
}

export function buildHomepageSummary(now = new Date()): HomepageSummary {
  ensureDatabase();
  const timeZone = householdTimeZone();
  return {
    generatedAt: now.toISOString(),
    nextMeal: nextMeal(now, timeZone),
    groceryList: currentGroceryList(),
  };
}
