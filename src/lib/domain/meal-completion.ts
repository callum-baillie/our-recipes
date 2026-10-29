import { z } from 'zod';

export const mealCompletionSchema = z
  .object({
    recipeId: z.string().uuid(),
    mealPlanEntryId: z.string().uuid(),
    // Explicit answers are accepted only for people without an existing planned allocation.
    portions: z
      .array(
        z
          .object({ profileId: z.string().uuid(), servings: z.number().positive().max(100) })
          .strict(),
      )
      .max(50)
      .default([]),
  })
  .strict();
export type MealCompletionInput = z.infer<typeof mealCompletionSchema>;

export const MEAL_WINDOWS: Record<string, [number, number]> = {
  breakfast: [5, 11],
  brunch: [9, 13],
  lunch: [11, 16],
  dinner: [16, 21],
  supper: [18, 23],
  dessert: [16, 23],
};
/** Preparing early is a reason to ask, never evidence that a meal has been eaten. */
export function mealScanTiming(slot: string, hour: number, preparationMinutes = 0) {
  const window = MEAL_WINDOWS[slot];
  if (!window) return 'review' as const;
  if (hour >= window[0] && hour < window[1]) return 'meal' as const;
  if (hour < window[0] && hour >= window[0] - Math.min(Math.max(preparationMinutes, 0), 1440) / 60)
    return 'preparing' as const;
  return 'review' as const;
}
