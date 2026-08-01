import { localIsoDate } from '@/lib/domain/local-date';

const MEAL_SLOT_HOURS: Record<string, number> = {
  suhoor: 5,
  breakfast: 8,
  brunch: 10,
  lunch: 12,
  snack: 15,
  tiffin: 15,
  dinner: 18,
  iftar: 19,
  supper: 20,
  dessert: 20,
};

type MealLifecycle = {
  plannedFor: string;
  meal: string;
  status: string;
  effectiveStatus?: string;
};

type ZonedParts = {
  year: number;
  month: number;
  day: number;
  hour: number;
  minute: number;
  second: number;
};

function mealSlotHour(slot: string): number {
  return MEAL_SLOT_HOURS[slot] ?? 12;
}

function zonedParts(date: Date, timeZone: string): ZonedParts {
  return Object.fromEntries(
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
  ) as ZonedParts;
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

export function scheduledMealInstant(date: string, slot: string, timeZone: string): Date {
  const [year, month, day] = date.split('-').map(Number) as [number, number, number];
  const localAsUtc = Date.UTC(year, month - 1, day, mealSlotHour(slot), 0, 0);
  let candidate = new Date(localAsUtc);
  for (let pass = 0; pass < 2; pass += 1) {
    candidate = new Date(localAsUtc - timeZoneOffsetMinutes(candidate, timeZone) * 60_000);
  }
  return candidate;
}

export function isPlannedMealActive(
  meal: Pick<MealLifecycle, 'status' | 'effectiveStatus'>,
): boolean {
  return (meal.effectiveStatus ?? meal.status) === 'planned';
}

export function comparePlannedMeals(
  left: Pick<MealLifecycle, 'plannedFor' | 'meal'>,
  right: Pick<MealLifecycle, 'plannedFor' | 'meal'>,
): number {
  return (
    left.plannedFor.localeCompare(right.plannedFor) ||
    mealSlotHour(left.meal) - mealSlotHour(right.meal) ||
    left.meal.localeCompare(right.meal)
  );
}

export function nextActionableMeal<T extends MealLifecycle>(
  meals: T[],
  now: Date,
  timeZone: string,
): T | null {
  const today = localIsoDate(now, timeZone);
  return (
    meals
      .filter(
        (meal) =>
          isPlannedMealActive(meal) &&
          meal.plannedFor >= today &&
          scheduledMealInstant(meal.plannedFor, meal.meal, timeZone).getTime() > now.getTime(),
      )
      .sort(comparePlannedMeals)[0] ?? null
  );
}
