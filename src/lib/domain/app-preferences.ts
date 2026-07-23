import { z } from 'zod';

import { DEFAULT_VISIBLE_MEAL_TYPES } from '@/lib/domain/meal-types';

export const recipeDefaultSortSchema = z.enum([
  'recently-added',
  'recently-updated',
  'alphabetical',
  'most-recently-cooked',
  'shortest-time',
  'highest-rated',
]);

export const mealTypePreferenceSchema = z
  .string()
  .trim()
  .min(1)
  .max(48)
  .regex(/^[a-z0-9]+(?:-[a-z0-9]+)*$/u, 'Use a lowercase meal type identifier.');

export const customMealTypeSchema = z
  .object({
    value: mealTypePreferenceSchema.refine((value) => value.startsWith('custom-'), {
      message: 'Custom meal types must use a custom identifier.',
    }),
    label: z.string().trim().min(1).max(48),
  })
  .strict();

export const pantryDefaultViewSchema = z.enum([
  'all',
  'pantry',
  'refrigerator',
  'freezer',
  'low_stock',
  'opened',
  'unopened',
  'frozen',
  'recent',
]);

export const pantryDefaultSortSchema = z.enum([
  'expiry',
  'name',
  'quantity',
  'location',
  'updated',
  'added',
]);

export const pantryDefaultGroupSchema = z.enum(['none', 'location', 'category', 'expiry']);

export const recipePreferencesSchema = z
  .object({
    defaultSort: recipeDefaultSortSchema,
    defaultServings: z.number().int().min(1).max(100),
  })
  .strict();

export const mealPlanPreferencesSchema = z
  .object({
    weekStartsOn: z.union([z.literal(0), z.literal(1)]),
    defaultDuration: z.union([z.literal(3), z.literal(5), z.literal(7), z.literal(14)]),
    defaultMealTypes: z
      .array(mealTypePreferenceSchema)
      .min(1)
      .max(20)
      .refine((values) => new Set(values).size === values.length, 'Choose each meal type once.'),
    visibleMealTypes: z
      .array(mealTypePreferenceSchema)
      .min(1)
      .max(20)
      .refine((values) => new Set(values).size === values.length, 'Show each meal type once.')
      .default(DEFAULT_VISIBLE_MEAL_TYPES),
    customMealTypes: z.array(customMealTypeSchema).max(10).default([]),
  })
  .strict();

export const pantryPreferencesSchema = z
  .object({
    defaultView: pantryDefaultViewSchema,
    defaultSort: pantryDefaultSortSchema,
    defaultGroup: pantryDefaultGroupSchema,
  })
  .strict();

export const appPreferencesUpdateSchema = z.discriminatedUnion('category', [
  z.object({ category: z.literal('recipes'), values: recipePreferencesSchema }).strict(),
  z.object({ category: z.literal('mealPlan'), values: mealPlanPreferencesSchema }).strict(),
  z.object({ category: z.literal('pantry'), values: pantryPreferencesSchema }).strict(),
]);

export const freshInstallConfirmationSchema = z
  .object({ confirmation: z.literal('FRESH INSTALL') })
  .strict();

export type RecipePreferences = z.output<typeof recipePreferencesSchema>;
export type MealPlanPreferences = z.output<typeof mealPlanPreferencesSchema>;
export type PantryPreferences = z.output<typeof pantryPreferencesSchema>;
export type AppPreferencesUpdate = z.input<typeof appPreferencesUpdateSchema>;

export const DEFAULT_RECIPE_PREFERENCES: RecipePreferences = {
  defaultSort: 'recently-updated',
  defaultServings: 4,
};

export const DEFAULT_MEAL_PLAN_PREFERENCES: MealPlanPreferences = {
  weekStartsOn: 1,
  defaultDuration: 7,
  defaultMealTypes: ['breakfast', 'lunch', 'dinner'],
  visibleMealTypes: DEFAULT_VISIBLE_MEAL_TYPES,
  customMealTypes: [],
};

export const DEFAULT_PANTRY_PREFERENCES: PantryPreferences = {
  defaultView: 'all',
  defaultSort: 'expiry',
  defaultGroup: 'location',
};
