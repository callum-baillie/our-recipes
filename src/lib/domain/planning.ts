import { z } from 'zod';

import { mealTypePreferenceSchema } from '@/lib/domain/app-preferences';

export const isoDateSchema = z.string().regex(/^\d{4}-\d{2}-\d{2}$/, 'Use a YYYY-MM-DD date.');

export const mealPlanStatusSchema = z.enum(['planned', 'skipped', 'cancelled']);
export type MealPlanStatus = z.output<typeof mealPlanStatusSchema>;

export const mealPlanStatusUpdateSchema = z.object({ status: mealPlanStatusSchema }).strict();

export const mealPlanEntrySchema = z
  .object({
    plannedFor: isoDateSchema,
    meal: mealTypePreferenceSchema,
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

export const swapMealPlanEntriesSchema = z
  .object({
    sourceId: z.string().uuid(),
    targetId: z.string().uuid(),
    sourceExpectedUpdatedAt: z.string().datetime(),
    targetExpectedUpdatedAt: z.string().datetime(),
  })
  .refine((value) => value.sourceId !== value.targetId, {
    message: 'Choose two different planned meals.',
  });

export type SwapMealPlanEntriesInput = z.output<typeof swapMealPlanEntriesSchema>;

export const mealPlanBatchSchema = z.object({
  entries: z.array(mealPlanEntrySchema).min(1).max(280),
});

export const mealPlanEntryUpdateSchema = mealPlanEntrySchema.extend({
  expectedUpdatedAt: z.string().datetime(),
});

export const shoppingListGenerateSchema = z.object({
  weekStart: isoDateSchema,
  weekEnd: isoDateSchema,
});

export const shoppingListItemStateSchema = z.enum(['to_buy', 'in_cart', 'cant_find', 'sourced']);

export const shoppingListItemSchema = z.object({
  quantity: z.union([z.literal(''), z.coerce.number().positive().max(10_000)]),
  unit: z.string().trim().max(30),
  item: z.string().trim().min(1).max(160),
  note: z.string().trim().max(240),
  aisleId: z.union([z.literal(''), z.string().uuid()]).optional(),
  checked: z.boolean().default(false),
  shoppingState: shoppingListItemStateSchema.default('to_buy'),
  productId: z.string().uuid().optional(),
  recipeId: z.string().uuid().optional(),
  recommendationKey: z.string().trim().max(240).optional(),
});

export const shoppingListReorderSchema = z.object({
  itemIds: z.array(z.string().uuid()).min(1).max(1_000),
});

export const shoppingListCreateSchema = z
  .object({ name: z.string().trim().min(1).max(120) })
  .strict();

export const shoppingListRetryStoreSchema = z
  .object({ supermarketProfileId: z.string().uuid() })
  .strict();

export const shoppingListManageSchema = z.discriminatedUnion('action', [
  z.object({ action: z.literal('rename'), name: z.string().trim().min(1).max(120) }).strict(),
  z.object({ action: z.literal('archive') }).strict(),
  z.object({ action: z.literal('restore') }).strict(),
  z.object({ action: z.literal('duplicate') }).strict(),
]);

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
export type ShoppingListItemInput = Omit<
  z.output<typeof shoppingListItemSchema>,
  'shoppingState'
> & {
  shoppingState?: z.output<typeof shoppingListItemStateSchema>;
};
export type DuplicateWeekInput = z.output<typeof duplicateWeekSchema>;
export type MealPlanBatchInput = z.output<typeof mealPlanBatchSchema>;
export type MealPlanEntryUpdateInput = z.output<typeof mealPlanEntryUpdateSchema>;
export type ShoppingAisleInput = z.output<typeof shoppingAisleSchema>;
