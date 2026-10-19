import { isoDateSchema } from './planning';
import { addLocalDateDays } from './local-date';
import { MEAL_OPTIONS, mealTypeLabel, type MealTypeOption } from './meal-types';
import type { MealPlanPreferences } from './app-preferences';

/** Calendar focus is independent of the start of the displayed period. */
export function plannerFocus(
  candidate: string | undefined,
  start: string,
  end: string,
  today: string,
) {
  if (
    candidate &&
    isoDateSchema.safeParse(candidate).success &&
    candidate >= start &&
    candidate <= end
  )
    return candidate;
  return today >= start && today <= end ? today : start;
}

export function planningRangeError(start: string, end: string): string | null {
  if (!isoDateSchema.safeParse(start).success || !isoDateSchema.safeParse(end).success)
    return 'Enter a valid start and end date.';
  const days =
    Math.round((Date.parse(`${end}T12:00:00Z`) - Date.parse(`${start}T12:00:00Z`)) / 86_400_000) +
    1;
  return days < 1 || days > 14
    ? 'Choose an end date 1 to 14 days from the start, including both dates.'
    : null;
}

export function nextMealDate(date: string) {
  return addLocalDateDays(date, 1);
}

/** Historical identifiers remain visible even after their option is removed. */
export function plannerMealOptions(
  preferences: MealPlanPreferences,
  usedTypes: string[],
): MealTypeOption[] {
  const options: MealTypeOption[] = [
    ...MEAL_OPTIONS,
    ...preferences.customMealTypes.map((option) => ({ ...option, defaultVisible: false })),
  ];
  const known = new Set(options.map((option) => option.value));
  for (const value of usedTypes)
    if (!known.has(value)) {
      options.push({ value, label: mealTypeLabel(value), defaultVisible: false });
      known.add(value);
    }
  return options;
}

export type PreviewEntry = {
  entryKey?: string;
  plannedFor: string;
  meal: string;
  newRecipeKey: string | null;
  title: string;
  servings: number;
};
export type PreviewConflict = { entryId: string; plannedFor: string; meal: string; title: string };
export function effectivePlanEntries<T extends PreviewEntry>(
  entries: T[],
  conflicts: PreviewConflict[],
  resolutions: Record<string, 'keep' | 'replace'>,
) {
  return entries.map((entry) => {
    const kept = conflicts.filter(
      (conflict) =>
        conflict.plannedFor === entry.plannedFor &&
        conflict.meal === entry.meal &&
        resolutions[conflict.entryId] === 'keep',
    );
    const removed = conflicts.filter(
      (conflict) =>
        conflict.plannedFor === entry.plannedFor &&
        conflict.meal === entry.meal &&
        resolutions[conflict.entryId] === 'replace',
    );
    return {
      removed,
      entry,
      key: entry.entryKey ?? `${entry.plannedFor}:${entry.meal}`,
      kept,
      inserted: kept.length === 0,
    };
  });
}

export function shiftPlannerFocus(
  date: string,
  view: 'day' | 'week' | 'month',
  amount: number,
): string {
  if (view !== 'month') return addLocalDateDays(date, amount * (view === 'week' ? 7 : 1));
  const current = new Date(`${date}T12:00:00Z`);
  const day = current.getUTCDate();
  current.setUTCDate(1);
  current.setUTCMonth(current.getUTCMonth() + amount);
  const last = new Date(
    Date.UTC(current.getUTCFullYear(), current.getUTCMonth() + 1, 0),
  ).getUTCDate();
  current.setUTCDate(Math.min(day, last));
  return current.toISOString().slice(0, 10);
}
