import { z } from 'zod';

export const aiDataPolicySchema = z
  .object({
    shareSharedRecipes: z.boolean(),
    shareMealPlans: z.boolean(),
    shareDietaryPreferences: z.boolean(),
    shareRecipePreferences: z.boolean(),
    shareProfileGoals: z.boolean(),
    shareNutritionGoals: z.boolean(),
    shareNutritionAggregates: z.boolean(),
    shareRawDiary: z.boolean(),
    shareIdentity: z.boolean(),
    sharePersonalMetrics: z.boolean(),
    shareWeight: z.boolean(),
    shareShoppingLists: z.boolean(),
    sharePantry: z.boolean().default(false),
    shareKitchenEquipment: z.boolean().default(false),
    dailySummaryEnabled: z.boolean(),
    weeklySummaryEnabled: z.boolean(),
    summaryFrequency: z.enum(['off', 'daily', 'every_3_days', 'weekly', 'monthly']),
    summaryNutritionEnabled: z.boolean(),
    summaryMealPlansEnabled: z.boolean(),
    summaryShoppingListsEnabled: z.boolean(),
    summaryRecipesEnabled: z.boolean(),
    version: z.number().int().positive(),
  })
  .strict();
export type AiDataPolicy = z.infer<typeof aiDataPolicySchema>;
