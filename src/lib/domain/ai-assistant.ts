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
    shareShoppingLists: z.boolean(),
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

export const AI_SUMMARY_FREQUENCY_MS = {
  daily: 24 * 60 * 60 * 1_000,
  every_3_days: 3 * 24 * 60 * 60 * 1_000,
  weekly: 7 * 24 * 60 * 60 * 1_000,
  monthly: 30 * 24 * 60 * 60 * 1_000,
} as const;

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
  shareShoppingLists: true,
  dailySummaryEnabled: false,
  weeklySummaryEnabled: false,
  summaryFrequency: 'off',
  summaryNutritionEnabled: true,
  summaryMealPlansEnabled: true,
  summaryShoppingListsEnabled: true,
  summaryRecipesEnabled: true,
};

export const aiSettingsUpdateSchema = z
  .object({
    workloads: z.array(aiWorkloadSettingSchema).max(aiWorkloadSchema.options.length).optional(),
    dataPolicy: aiDataPolicySchema.optional(),
  })
  .strict();

const aiChatAttachmentSchema = z
  .object({
    kind: z.enum(['image', 'file']),
    name: z
      .string()
      .trim()
      .min(1)
      .max(120)
      .regex(/^[^<>:"/\\|?*\u0000-\u001f]+$/u),
    mimeType: z.enum([
      'image/jpeg',
      'image/png',
      'image/webp',
      'image/gif',
      'application/pdf',
      'text/plain',
      'text/csv',
      'application/json',
      'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
      'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
      'application/vnd.openxmlformats-officedocument.presentationml.presentation',
    ]),
    dataBase64: z
      .string()
      .min(1)
      .max(8_000_000)
      .regex(/^[a-z0-9+/]+={0,2}$/iu),
  })
  .strict()
  .superRefine((attachment, context) => {
    const isImage = attachment.mimeType.startsWith('image/');
    if ((attachment.kind === 'image') !== isImage) {
      context.addIssue({
        code: 'custom',
        path: ['mimeType'],
        message: 'Attachment kind does not match its media type.',
      });
    }
  });

export const aiChatMessageInputSchema = z
  .object({
    message: z.string().trim().max(8_000).default(''),
    attachments: z.array(aiChatAttachmentSchema).max(4).default([]),
  })
  .strict()
  .superRefine((input, context) => {
    if (!input.message && input.attachments.length === 0) {
      context.addIssue({
        code: 'custom',
        path: ['message'],
        message: 'Enter a message or attach a file.',
      });
    }
    if (
      input.attachments.reduce((total, attachment) => total + attachment.dataBase64.length, 0) >
      12_000_000
    ) {
      context.addIssue({
        code: 'custom',
        path: ['attachments'],
        message: 'Attachments are too large.',
      });
    }
  });

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

export const aiSummaryDomainSchema = z.enum([
  'nutrition',
  'meal_plans',
  'shopping_lists',
  'recipes',
]);
export type AiSummaryDomain = z.infer<typeof aiSummaryDomainSchema>;

export const aiSummaryMetricSchema = z
  .object({
    label: z.string().trim().min(1).max(80),
    value: z.string().trim().min(1).max(80),
    context: z.string().trim().max(160).default(''),
    trend: z.enum(['up', 'down', 'steady', 'none']).default('none'),
  })
  .strict();

export const aiSummaryItemSchema = z
  .object({
    domain: aiSummaryDomainSchema,
    headline: z.string().trim().min(1).max(160),
    summary: z.string().trim().min(1).max(600),
    highlights: z.array(z.string().trim().min(1).max(180)).max(3),
    metrics: z.array(aiSummaryMetricSchema).max(6).default([]),
    caveats: z.array(z.string().trim().min(1).max(180)).max(3),
  })
  .strict();

export const aiSummaryBundleOutputSchema = z
  .object({
    summaries: z.array(aiSummaryItemSchema).max(aiSummaryDomainSchema.options.length),
  })
  .strict()
  .superRefine((value, context) => {
    const seen = new Set<AiSummaryDomain>();
    value.summaries.forEach((summary, index) => {
      if (seen.has(summary.domain)) {
        context.addIssue({
          code: 'custom',
          path: ['summaries', index, 'domain'],
          message: 'Each summary domain may appear only once.',
        });
      }
      seen.add(summary.domain);
    });
  });
export type AiSummaryBundleOutput = z.infer<typeof aiSummaryBundleOutputSchema>;

export type AiAssistantStreamEvent =
  | { type: 'status'; message: string }
  | { type: 'text'; delta: string }
  | { type: 'action'; actionId: string; kind: z.infer<typeof aiActionKindSchema>; preview: unknown }
  | { type: 'done'; messageId: string }
  | { type: 'error'; message: string };
