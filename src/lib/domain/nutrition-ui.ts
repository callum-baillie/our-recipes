import {
  ingredientFoodRecordMultiplier,
  type FoodRecordBasis,
} from './nutrition-recipe-calculation';

export const NUTRITION_MEALS = ['breakfast', 'lunch', 'dinner', 'snack', 'other'] as const;
export const POUNDS_PER_KILOGRAM = 2.2046226218;

export function nutritionWallTime(value: Date, timeZone: string) {
  const parts = new Intl.DateTimeFormat('en-CA', {
    timeZone,
    hourCycle: 'h23',
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
    hour: '2-digit',
    minute: '2-digit',
  }).formatToParts(value);
  const get = (key: Intl.DateTimeFormatPartTypes) =>
    parts.find((part) => part.type === key)?.value ?? '';
  return `${get('year')}-${get('month')}-${get('day')}T${get('hour')}:${get('minute')}`;
}

/** Resolve a profile-local clock time without using the browser's timezone or normalising DST gaps. */
export function nutritionEventCandidates(local: string, timeZone: string): string[] {
  if (!/^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}$/u.test(local)) return [];
  const nominal = Date.parse(`${local}:00Z`);
  if (!Number.isFinite(nominal) || new Date(nominal).toISOString().slice(0, 16) !== local)
    return [];
  const offsets = new Set<number>();
  for (const hours of [-36, -12, 0, 12, 36]) {
    const instant = nominal + hours * 3_600_000;
    const represented = Date.parse(`${nutritionWallTime(new Date(instant), timeZone)}:00Z`);
    offsets.add(represented - instant);
  }
  return [...offsets]
    .map((offset) => nominal - offset)
    .filter((instant) => nutritionWallTime(new Date(instant), timeZone) === local)
    .sort((a, b) => a - b)
    .map((instant) => new Date(instant).toISOString());
}

export function nutritionEventInstant(
  date: string,
  time: string,
  timeZone: string,
  occurrence = '',
) {
  const candidates = nutritionEventCandidates(`${date}T${time}`, timeZone);
  if (!candidates.length)
    throw new Error(
      'Enter a valid date and time in the profile timezone. That clock time may not exist during a daylight-saving change.',
    );
  if (candidates.length > 1 && !['earlier', 'later'].includes(occurrence))
    throw new Error('This clock time occurs twice. Choose the earlier or later occurrence.');
  return occurrence === 'later' ? candidates.at(-1)! : candidates[0]!;
}

export function nutritionKnownAverage(days: Record<string, Record<string, number>>, code: string) {
  const known = Object.values(days).flatMap((day) =>
    Number.isFinite(day[code]) ? [day[code]!] : [],
  );
  return {
    value: known.length ? known.reduce((sum, value) => sum + value, 0) / known.length : undefined,
    days: known.length,
  };
}

export function supportedFoodUnits(record: FoodRecordBasis) {
  const preferred =
    record.basisType === 'per_100ml'
      ? 'ml'
      : record.basisType === 'per_unit'
        ? record.basisUnit
        : 'g';
  return [
    ...new Set([
      preferred,
      record.basisUnit,
      'g',
      'kg',
      'oz',
      'lb',
      'ml',
      'l',
      'tsp',
      'tbsp',
      'cup',
      'each',
    ]),
  ].filter((unit) => ingredientFoodRecordMultiplier(1, unit, record).supported);
}

export function displayNutritionWeight(kilograms: number, imperial = false) {
  return `${(kilograms * (imperial ? POUNDS_PER_KILOGRAM : 1)).toLocaleString(undefined, { maximumFractionDigits: 1 })} ${imperial ? 'lb' : 'kg'}`;
}

export function nutritionPortion(entry: {
  servingCount?: number | null;
  portionWeightGrams?: number | null;
  quantity?: number | null;
  unit?: string | null;
}) {
  if (entry.portionWeightGrams != null) return `${entry.portionWeightGrams} g consumed`;
  if (entry.servingCount != null)
    return `${entry.servingCount} ${entry.servingCount === 1 ? 'serving' : 'servings'}`;
  return entry.quantity != null ? `${entry.quantity} ${entry.unit ?? ''}`.trim() : '';
}

export function isNutritionDate(value: string) {
  if (!/^\d{4}-\d{2}-\d{2}$/u.test(value)) return false;
  const instant = Date.parse(`${value}T12:00:00Z`);
  return Number.isFinite(instant) && new Date(instant).toISOString().slice(0, 10) === value;
}
