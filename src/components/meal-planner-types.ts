import type { MealType } from '@/lib/domain/meal-types';

export {
  DEFAULT_VISIBLE_MEAL_TYPES,
  MEAL_OPTIONS,
  mealTypeLabel,
  type MealType,
  type MealTypeOption,
} from '@/lib/domain/meal-types';

export function addPlannerDays(date: string, days: number): string {
  const value = new Date(`${date}T12:00:00Z`);
  value.setUTCDate(value.getUTCDate() + days);
  return value.toISOString().slice(0, 10);
}

export function plannerDates(startDate: string, duration: number): string[] {
  return Array.from({ length: duration }, (_, index) => addPlannerDays(startDate, index));
}

export function formatPlannerDate(date: string, options?: Intl.DateTimeFormatOptions): string {
  return new Intl.DateTimeFormat('en-US', {
    timeZone: 'UTC',
    ...options,
  }).format(new Date(`${date}T12:00:00Z`));
}
