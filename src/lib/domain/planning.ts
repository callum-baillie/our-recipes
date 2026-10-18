import { z } from 'zod';

import { recipeInputSchema, recipeIngredientSchema } from '@/lib/domain/recipe';

import { mealTypePreferenceSchema } from '@/lib/domain/app-preferences';

export const isoDateSchema = z.iso.date();

export const mealPlanStatusSchema = z.enum(['planned', 'skipped', 'cancelled']);
export type MealPlanStatus = z.output<typeof mealPlanStatusSchema>;

export const mealPlanOptionSchema = z.discriminatedUnion('kind', [
  z
    .object({
      kind: z.literal('recipe'),
      recipeId: z.string().uuid(),
      label: z.string().trim().min(1).max(160),
    })
    .strict(),
  z
    .object({
      kind: z.literal('pantry'),
      productId: z.string().uuid(),
      label: z.string().trim().min(1).max(160),
    })
    .strict(),
]);
export type MealPlanOptionInput = z.output<typeof mealPlanOptionSchema>;

export const mealPlanStatusUpdateSchema = z.object({ status: mealPlanStatusSchema }).strict();

export const mealPlanEntrySchema = z
  .object({
    kind: z.enum(['recipe', 'item', 'takeout', 'leftover', 'custom', 'fast', 'options']).optional(),
    profileIds: z
      .array(z.string().uuid())
      .max(50)
      .refine((ids) => new Set(ids).size === ids.length, 'Choose each person once.')
      .optional(),
    options: z.array(mealPlanOptionSchema).min(2).max(12).optional(),
    leftoverSourceId: z.string().uuid().nullable().optional(),
    foodItem: recipeIngredientSchema.nullable().optional(),
    recipeOverride: recipeInputSchema
      .pick({
        title: true,
        summary: true,
        servings: true,
        ingredientGroups: true,
        instructionSections: true,
      })
      .nullable()
      .optional(),
    plannedFor: isoDateSchema,
    meal: mealTypePreferenceSchema,
    recipeId: z.union([z.literal(''), z.string().uuid()]).default(''),
    title: z.string().trim().max(160).default(''),
    servings: z.coerce.number().int().min(1).max(100),
    note: z.string().trim().max(240),
  })
  .superRefine((value, context) => {
    if (value.kind === 'options' && (value.options?.length ?? 0) < 2)
      context.addIssue({
        code: 'custom',
        path: ['options'],
        message: 'Add at least two meal options.',
      });
    if (value.kind !== 'options' && value.options?.length)
      context.addIssue({
        code: 'custom',
        path: ['options'],
        message: 'Options can only be added to an options meal.',
      });
    if (value.kind === 'leftover' && !value.leftoverSourceId)
      context.addIssue({
        code: 'custom',
        path: ['leftoverSourceId'],
        message: 'Choose the meal these leftovers come from.',
      });
    if (value.kind === 'item' && !value.foodItem)
      context.addIssue({
        code: 'custom',
        path: ['foodItem'],
        message: 'Add the food and quantity per serving.',
      });
    if (value.recipeOverride && !value.recipeId)
      context.addIssue({
        code: 'custom',
        path: ['recipeOverride'],
        message: 'Choose the original recipe before adapting it.',
      });
    if (value.kind === 'recipe' && !value.recipeId)
      context.addIssue({ code: 'custom', path: ['recipeId'], message: 'Choose a recipe.' });
    if (
      ['item', 'takeout', 'custom', 'fast', 'options'].includes(value.kind ?? '') &&
      value.recipeId
    )
      context.addIssue({
        code: 'custom',
        path: ['recipeId'],
        message: 'This meal type does not use a recipe.',
      });
    if (
      !value.recipeId &&
      !value.title &&
      !value.leftoverSourceId &&
      !['fast', 'options'].includes(value.kind ?? '')
    ) {
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

export const mealPlanEntryUpdateSchema = mealPlanEntrySchema.safeExtend({
  expectedUpdatedAt: z.string().datetime(),
});

export const shoppingListGenerateSchema = z.object({
  weekStart: isoDateSchema,
  weekEnd: isoDateSchema,
});

export const shoppingListRequestSchema = z.discriminatedUnion('kind', [
  z
    .object({
      kind: z.literal('manual'),
      name: z.string().trim().min(1).max(120),
      makeAutomaticRestockTarget: z.boolean().default(false),
    })
    .strict(),
  z
    .object({
      kind: z.literal('planner'),
      weekStart: isoDateSchema,
      weekEnd: isoDateSchema,
      sourceMode: z.enum(['pantry_missing', 'pantry_all']).default('pantry_all'),
      makeAutomaticRestockTarget: z.boolean().default(false),
    })
    .strict(),
]);

export const shoppingListSourceKindSchema = z.enum([
  'manual',
  'planner_all',
  'pantry_missing',
  'pantry_all',
]);
export type ShoppingListSourceKind = z.output<typeof shoppingListSourceKindSchema>;

export function shoppingListSourceKind(sourceMode: string): ShoppingListSourceKind {
  if (sourceMode === 'planned_all') return 'planner_all';
  if (sourceMode === 'pantry_missing') return 'pantry_missing';
  if (sourceMode === 'pantry_all') return 'pantry_all';
  return 'manual';
}

export function shoppingListSourceLabel(source: ShoppingListSourceKind): string {
  if (source === 'planner_all') return 'Planner all-items';
  if (source === 'pantry_missing') return 'Pantry missing-items';
  if (source === 'pantry_all') return 'Pantry all-items';
  return 'Manual list';
}

export const shoppingListItemStateSchema = z.enum(['to_buy', 'in_cart', 'cant_find', 'sourced']);

export const shoppingListItemSchema = z.object({
  quantity: z.union([z.literal(''), z.coerce.number().positive().max(10_000)]),
  unit: z.string().trim().max(30),
  item: z.string().trim().min(1).max(160),
  note: z.string().trim().max(240),
  aisleId: z.union([z.literal(''), z.string().uuid()]).optional(),
  checked: z.boolean().default(false),
  shoppingState: shoppingListItemStateSchema.default('to_buy'),
  cartQuantity: z.coerce.number().min(0).max(10_000).optional(),
  cartLabel: z.string().trim().max(160).optional(),
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
  z
    .object({
      action: z.literal('set_notes'),
      note: z.string().trim().max(2000),
      expectedVersion: z.number().int().min(0),
    })
    .strict(),
  z.object({ action: z.literal('rename'), name: z.string().trim().min(1).max(120) }).strict(),
  z.object({ action: z.literal('archive') }).strict(),
  z.object({ action: z.literal('restore') }).strict(),
  z.object({ action: z.literal('duplicate') }).strict(),
  z.object({ action: z.literal('set_restock_target') }).strict(),
  z.object({ action: z.literal('complete') }).strict(),
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
  'shoppingState' | 'cartQuantity' | 'cartLabel'
> & {
  shoppingState?: z.output<typeof shoppingListItemStateSchema>;
  cartQuantity?: number;
  cartLabel?: string;
};
export type DuplicateWeekInput = z.output<typeof duplicateWeekSchema>;
export type MealPlanBatchInput = z.output<typeof mealPlanBatchSchema>;
export type MealPlanEntryUpdateInput = z.output<typeof mealPlanEntryUpdateSchema>;
export type ShoppingAisleInput = z.output<typeof shoppingAisleSchema>;
