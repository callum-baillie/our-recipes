import { z } from 'zod';

import { aiStructuredRecipeSchema } from '@/lib/domain/ai';
import { mealTypePreferenceSchema } from '@/lib/domain/app-preferences';
import { recipeInputSchema } from '@/lib/domain/recipe';

export const aiWorkloadSchema = z.enum([
  'chat',
  'recipe_review',
  'recipe_generation',
  'meal_plan_generation',
  'nutrition_estimation',
  'nutrition_summary',
  'image_generation',
]);
export type AiWorkload = z.infer<typeof aiWorkloadSchema>;

export const aiReasoningEffortSchema = z.enum(['none', 'low', 'medium', 'high', 'xhigh', 'max']);
export type AiReasoningEffort = z.infer<typeof aiReasoningEffortSchema>;

export const AI_WORKLOAD_DEFAULTS: Record<
  AiWorkload,
  { model: string; reasoningEffort: AiReasoningEffort | null }
> = {
  chat: { model: 'gpt-5.6-terra', reasoningEffort: 'medium' },
  recipe_review: { model: 'gpt-5.4-mini', reasoningEffort: null },
  recipe_generation: { model: 'gpt-5.6-luna', reasoningEffort: 'medium' },
  meal_plan_generation: { model: 'gpt-5.6-terra', reasoningEffort: 'medium' },
  nutrition_estimation: { model: 'gpt-5.4-mini', reasoningEffort: null },
  nutrition_summary: { model: 'gpt-5.6-luna', reasoningEffort: 'low' },
  image_generation: { model: 'gpt-image-2', reasoningEffort: null },
};

export const AI_MODEL_CATALOG = [
  {
    id: 'gpt-5.6-sol',
    label: 'GPT-5.6 Sol',
    workloads: aiWorkloadSchema.options.filter((item) => item !== 'image_generation'),
    reasoning: ['none', 'low', 'medium', 'high', 'xhigh', 'max'],
  },
  {
    id: 'gpt-5.6-terra',
    label: 'GPT-5.6 Terra',
    workloads: aiWorkloadSchema.options.filter((item) => item !== 'image_generation'),
    reasoning: ['none', 'low', 'medium', 'high', 'xhigh', 'max'],
  },
  {
    id: 'gpt-5.6-luna',
    label: 'GPT-5.6 Luna',
    workloads: aiWorkloadSchema.options.filter((item) => item !== 'image_generation'),
    reasoning: ['none', 'low', 'medium', 'high', 'xhigh', 'max'],
  },
  {
    id: 'gpt-5.4-mini',
    label: 'GPT-5.4 Mini',
    workloads: aiWorkloadSchema.options.filter((item) => item !== 'image_generation'),
    reasoning: [],
  },
  {
    id: 'gpt-4o',
    label: 'GPT-4o',
    workloads: aiWorkloadSchema.options.filter((item) => item !== 'image_generation'),
    reasoning: [],
  },
  {
    id: 'gpt-image-2',
    label: 'GPT Image 2',
    workloads: ['image_generation'],
    reasoning: [],
  },
] as const;

export const aiWorkloadSettingSchema = z
  .object({
    workload: aiWorkloadSchema,
    model: z
      .string()
      .trim()
      .regex(/^[a-z0-9][a-z0-9._:-]{1,78}$/u),
    reasoningEffort: aiReasoningEffortSchema.nullable(),
    enabled: z.boolean().default(true),
    version: z.number().int().positive(),
  })
  .strict();

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
    dailySummaryEnabled: z.boolean(),
    weeklySummaryEnabled: z.boolean(),
    version: z.number().int().positive(),
  })
  .strict();
export type AiDataPolicy = z.infer<typeof aiDataPolicySchema>;

export const DEFAULT_AI_DATA_POLICY: Omit<AiDataPolicy, 'version'> = {
  shareSharedRecipes: true,
  shareMealPlans: true,
  shareDietaryPreferences: true,
  shareRecipePreferences: true,
  shareProfileGoals: false,
  shareNutritionGoals: true,
  shareNutritionAggregates: true,
  shareRawDiary: false,
  shareIdentity: false,
  sharePersonalMetrics: false,
  shareWeight: false,
  dailySummaryEnabled: true,
  weeklySummaryEnabled: true,
};

export const aiSettingsUpdateSchema = z
  .object({
    workloads: z.array(aiWorkloadSettingSchema).max(aiWorkloadSchema.options.length).optional(),
    dataPolicy: aiDataPolicySchema.optional(),
  })
  .strict();

export const aiChatMessageInputSchema = z
  .object({ message: z.string().trim().min(1).max(8_000) })
  .strict();

export const aiActionKindSchema = z.enum([
  'recipe_create',
  'recipe_batch_create',
  'recipe_update',
  'meal_plan_change',
  'meal_plan_generate',
  'nutrition_entry',
]);

export const aiActionDecisionSchema = z
  .object({
    decision: z.enum(['confirm', 'cancel']),
    conflictResolutions: z
      .array(
        z
          .object({
            entryId: z.string().uuid(),
            resolution: z.enum(['keep', 'replace']),
          })
          .strict(),
      )
      .max(35)
      .default([]),
  })
  .strict();

export const aiMealPlanOptionsSchema = z
  .object({
    followNutrition: z.boolean().default(true),
    generateMissingRecipes: z.boolean().default(false),
    easyGroceryList: z.boolean().default(true),
    allowRepeatingMeals: z.boolean().default(false),
    planLeftovers: z.boolean().default(false),
    generateRecipeImages: z.boolean().default(false),
  })
  .strict();

export const aiFixedMealSchema = z
  .object({
    plannedFor: z.string().regex(/^\d{4}-\d{2}-\d{2}$/u),
    meal: mealTypePreferenceSchema,
    existingRecipeId: z.string().uuid().nullable().default(null),
    newRecipeBrief: z.string().trim().max(500).nullable().default(null),
  })
  .strict()
  .refine((value) => Boolean(value.existingRecipeId) !== Boolean(value.newRecipeBrief), {
    message: 'A fixed meal must identify one saved recipe or one new recipe brief.',
  });

export const aiMealPlanGenerationRequestSchema = z
  .object({
    mode: z.enum(['recipebook', 'ai']).default('ai'),
    startDate: z.string().regex(/^\d{4}-\d{2}-\d{2}$/u),
    endDate: z.string().regex(/^\d{4}-\d{2}-\d{2}$/u),
    mealSlots: z.array(mealTypePreferenceSchema).min(1).max(5),
    servings: z.number().int().min(1).max(100),
    sourceMode: z.enum(['existing', 'new', 'mix']),
    occupiedSlotMode: z.enum(['keep', 'replace', 'review']).default('review'),
    selectedProfileIds: z.array(z.string().uuid()).min(1).max(20).default([]),
    options: aiMealPlanOptionsSchema.default({
      followNutrition: false,
      generateMissingRecipes: false,
      easyGroceryList: true,
      allowRepeatingMeals: false,
      planLeftovers: false,
      generateRecipeImages: false,
    }),
    fixedMeals: z.array(aiFixedMealSchema).max(35).default([]),
    instructions: z.string().trim().max(2_000).default(''),
  })
  .strict()
  .superRefine((value, context) => {
    const start = Date.parse(`${value.startDate}T12:00:00Z`);
    const end = Date.parse(`${value.endDate}T12:00:00Z`);
    const days = Math.round((end - start) / 86_400_000) + 1;
    if (!Number.isFinite(days) || days < 1 || days > 14) {
      context.addIssue({ code: 'custom', path: ['endDate'], message: 'Choose 1 to 14 days.' });
    }
  });

const generatedRecipeSchema = z
  .object({ key: z.string().trim().min(1).max(80), recipe: recipeInputSchema })
  .strict();

export const aiMealPlanAllocationSchema = z
  .object({
    entryKey: z.string().trim().min(1).max(100),
    householdProfileId: z.string().uuid(),
    servings: z.number().positive().max(20),
  })
  .strict();

export const aiMealPlanLeftoverLinkSchema = z
  .object({
    sourceEntryKey: z.string().trim().min(1).max(100),
    destinationEntryKey: z.string().trim().min(1).max(100),
    servings: z.number().positive().max(100),
  })
  .strict();

export const aiMealPlanCandidateSchema = z
  .object({
    newRecipes: z.array(generatedRecipeSchema).max(35),
    entries: z
      .array(
        z
          .object({
            entryKey: z.string().trim().min(1).max(100).optional(),
            plannedFor: z.string().regex(/^\d{4}-\d{2}-\d{2}$/u),
            meal: mealTypePreferenceSchema,
            existingRecipeId: z.string().uuid().nullable(),
            newRecipeKey: z.string().max(80).nullable(),
            title: z.string().trim().max(160),
            servings: z.number().int().min(1).max(100),
            note: z.string().trim().max(240),
          })
          .strict(),
      )
      .min(1)
      .max(35),
    allocations: z.array(aiMealPlanAllocationSchema).max(700).default([]),
    leftoverLinks: z.array(aiMealPlanLeftoverLinkSchema).max(35).default([]),
    warnings: z.array(z.string().trim().min(1).max(240)).max(20),
    assumptions: z.array(z.string().trim().min(1).max(240)).max(20),
  })
  .strict();
export type AiMealPlanCandidate = z.infer<typeof aiMealPlanCandidateSchema>;

export const aiMealPlanStructuredOutputSchema = z
  .object({
    newRecipes: z
      .array(
        z.object({ key: z.string().min(1).max(80), recipe: aiStructuredRecipeSchema }).strict(),
      )
      .max(35),
    entries: z
      .array(
        z
          .object({
            plannedFor: z.string().regex(/^\d{4}-\d{2}-\d{2}$/u),
            meal: mealTypePreferenceSchema,
            existingRecipeId: z.string().nullable(),
            newRecipeKey: z.string().max(80).nullable(),
            title: z.string().max(160),
            servings: z.number().int().min(1).max(100),
            note: z.string().max(240),
          })
          .strict(),
      )
      .min(1)
      .max(35),
    warnings: z.array(z.string().min(1).max(240)).max(20),
    assumptions: z.array(z.string().min(1).max(240)).max(20),
  })
  .strict();

export const aiSummaryKindSchema = z.enum([
  'daily_nutrition',
  'weekly_nutrition',
  'weekly_planning',
]);
export type AiSummaryKind = z.infer<typeof aiSummaryKindSchema>;

export const aiSummaryOutputSchema = z
  .object({
    headline: z.string().trim().min(1).max(160),
    body: z.string().trim().min(1).max(1_500),
    highlights: z.array(z.string().trim().min(1).max(240)).max(5),
    caveats: z.array(z.string().trim().min(1).max(240)).max(5),
  })
  .strict();

export type AiAssistantStreamEvent =
  | { type: 'status'; message: string }
  | { type: 'text'; delta: string }
  | { type: 'action'; actionId: string; kind: z.infer<typeof aiActionKindSchema>; preview: unknown }
  | { type: 'done'; messageId: string }
  | { type: 'error'; message: string };
