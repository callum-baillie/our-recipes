import { z } from 'zod';

export const isoDateSchema = z.string().regex(/^\d{4}-\d{2}-\d{2}$/, 'Use a YYYY-MM-DD date.');

export const mealPlanEntrySchema = z
  .object({
    plannedFor: isoDateSchema,
    meal: z.enum(['breakfast', 'lunch', 'dinner', 'snack']),
    recipeId: z.union([z.literal(''), z.string().uuid()]).default(''),
    title: z.string().trim().max(160).default(''),
    servings: z.coerce.number().int().min(1).max(100),
    note: z.string().trim().max(240),
  })
  .superRefine((value, context) => {
    if (!value.recipeId && !value.title) {
      context.addIssue({
        code: 'custom',
        path: ['title'],
        message: 'Choose a recipe or add a meal title.',
      });
    }
  });

export const duplicateWeekSchema = z.object({
  weekStart: isoDateSchema,
  destinationWeekStart: isoDateSchema,
});

export const shoppingListGenerateSchema = z.object({
  weekStart: isoDateSchema,
  weekEnd: isoDateSchema,
});

export const shoppingListItemSchema = z.object({
  quantity: z.union([z.literal(''), z.coerce.number().positive().max(10_000)]),
  unit: z.string().trim().max(30),
  item: z.string().trim().min(1).max(160),
  note: z.string().trim().max(240),
  aisleId: z.union([z.literal(''), z.string().uuid()]).default(''),
  checked: z.boolean().default(false),
});

export const shoppingListReorderSchema = z.object({
  itemIds: z.array(z.string().uuid()).min(1).max(1_000),
});

export const shoppingAisleSchema = z.object({
  name: z.string().trim().min(1).max(80),
});

export const shoppingAisleOrderSchema = z.object({
  aisleIds: z.array(z.string().uuid()).min(1).max(100),
});

export type MealPlanEntryInput = Omit<
  z.output<typeof mealPlanEntrySchema>,
  'recipeId' | 'title'
> & {
  recipeId?: string;
  title?: string;
};
export type ShoppingListItemInput = Omit<z.output<typeof shoppingListItemSchema>, 'aisleId'> & {
  aisleId?: string;
};
export type DuplicateWeekInput = z.output<typeof duplicateWeekSchema>;
export type ShoppingAisleInput = z.output<typeof shoppingAisleSchema>;
