import { z } from 'zod';

import { recipeInputSchema } from '@/lib/domain/recipe';

export const aiOperationKindSchema = z.enum([
  'text-normalization',
  'vision-extraction',
  'image-generation',
]);

export const aiUncertainSegmentSchema = z
  .object({
    field: z.string().trim().min(1).max(80),
    rawText: z.string().trim().min(1).max(500),
    reason: z.string().trim().min(1).max(240),
  })
  .strict();

export const aiRecipeCandidateSchema = z
  .object({
    recipe: recipeInputSchema,
    confidence: z.number().min(0).max(1),
    warnings: z.array(z.string().trim().min(1).max(240)).max(40),
    uncertainSegments: z.array(aiUncertainSegmentSchema).max(40),
  })
  .strict();

// OpenAI Structured Outputs needs an all-required JSON Schema without input
// coercions, defaults, or transforms. The provider validates against this
// boundary first, then `aiRecipeCandidateSchema` normalizes it for the app.
const aiStructuredIngredientSchema = z
  .object({
    quantity: z.union([z.literal(''), z.number().positive().max(10_000)]),
    unit: z.string().max(30),
    item: z.string().min(1).max(160),
    note: z.string().max(240),
  })
  .strict();

const aiStructuredRecipeSchema = z
  .object({
    title: z.string().min(1).max(160),
    summary: z.string().max(800),
    status: z.enum(['active', 'archived', 'trash']),
    servings: z.string().min(1).max(80),
    prepMinutes: z.number().int().min(0).max(10_080),
    cookMinutes: z.number().int().min(0).max(10_080),
    restMinutes: z.number().int().min(0).max(10_080),
    difficulty: z.string().max(40),
    cuisine: z.string().max(80),
    category: z.string().max(80),
    tips: z.string().max(2_000),
    sharedNotes: z.string().max(2_000),
    sourceName: z.string().max(160),
    sourceUrl: z.union([z.literal(''), z.string().url().max(2_048)]),
    originalAuthor: z.string().max(160),
    cookingMethod: z.string().max(80),
    equipment: z.array(z.string().min(1).max(120)).max(30),
    nutritionCalories: z.union([z.literal(''), z.number().min(0).max(100_000)]),
    nutritionProteinGrams: z.union([z.literal(''), z.number().min(0).max(100_000)]),
    nutritionCarbohydrateGrams: z.union([z.literal(''), z.number().min(0).max(100_000)]),
    nutritionFatGrams: z.union([z.literal(''), z.number().min(0).max(100_000)]),
    nutritionFiberGrams: z.union([z.literal(''), z.number().min(0).max(100_000)]),
    tags: z.array(z.string().min(1).max(40)).max(20),
    ingredientGroups: z
      .array(
        z
          .object({
            name: z.string().max(80),
            ingredients: z.array(aiStructuredIngredientSchema).min(1).max(80),
          })
          .strict(),
      )
      .min(1)
      .max(20),
    instructionSections: z
      .array(
        z
          .object({
            title: z.string().max(80),
            steps: z.array(z.string().min(1).max(2_000)).min(1).max(80),
          })
          .strict(),
      )
      .min(1)
      .max(20),
  })
  .strict();

export const aiRecipeCandidateStructuredOutputSchema = z
  .object({
    recipe: aiStructuredRecipeSchema,
    confidence: z.number().min(0).max(1),
    warnings: z.array(z.string().min(1).max(240)).max(40),
    uncertainSegments: z
      .array(
        z
          .object({
            field: z.string().min(1).max(80),
            rawText: z.string().min(1).max(500),
            reason: z.string().min(1).max(240),
          })
          .strict(),
      )
      .max(40),
  })
  .strict();

export const aiReviewRequestSchema = z
  .object({
    kind: aiOperationKindSchema.exclude(['image-generation']),
    sourceDigest: z.string().regex(/^[a-f0-9]{64}$/u),
    sourceLabel: z.string().trim().min(1).max(160),
  })
  .strict();

export const aiTextReviewRequestSchema = z
  .object({
    confirm: z.literal(true),
    kind: z.literal('text-normalization'),
    sourceText: z.string().trim().min(20).max(30_000),
    sourceLabel: z.string().trim().min(1).max(160),
  })
  .strict();

export const aiVisionReviewRequestSchema = z
  .object({
    confirm: z.literal(true),
    kind: z.literal('vision-extraction'),
    importId: z.string().uuid(),
  })
  .strict();

export const aiReviewActionSchema = z.discriminatedUnion('kind', [
  aiTextReviewRequestSchema,
  aiVisionReviewRequestSchema,
]);

export const aiImageGenerationRequestSchema = z
  .object({
    confirm: z.literal(true),
  })
  .strict();

export const aiConnectionStatusSchema = z
  .object({
    provider: z.literal('OpenAI'),
    state: z.enum(['unconfigured', 'configured']),
    enabled: z.boolean(),
    message: z.string().min(1).max(240),
    supportedOperationKinds: z.array(aiOperationKindSchema),
  })
  .strict();

export const aiOperationAuditStatusSchema = z.enum(['requested', 'succeeded', 'failed']);

export const aiOperationAuditSchema = z
  .object({
    id: z.string().uuid(),
    kind: aiOperationKindSchema,
    status: aiOperationAuditStatusSchema,
    sourceDigest: z.string().regex(/^[a-f0-9]{64}$/u),
    sourceLabel: z.string().trim().min(1).max(160),
    provider: z.literal('OpenAI'),
    model: z.string().trim().min(1).max(80),
    profileId: z.string().uuid(),
    recipeId: z.string().uuid().nullable(),
    importId: z.string().uuid().nullable(),
    generatedImageId: z.string().uuid().nullable(),
    createdAt: z.date(),
    completedAt: z.date().nullable(),
  })
  .strict();

export type AiOperationKind = z.infer<typeof aiOperationKindSchema>;
export type AiRecipeCandidate = z.infer<typeof aiRecipeCandidateSchema>;
export type AiReviewRequest = z.infer<typeof aiReviewRequestSchema>;
export type AiTextReviewRequest = z.infer<typeof aiTextReviewRequestSchema>;
export type AiVisionReviewRequest = z.infer<typeof aiVisionReviewRequestSchema>;
export type AiReviewAction = z.infer<typeof aiReviewActionSchema>;
export type AiImageGenerationRequest = z.infer<typeof aiImageGenerationRequestSchema>;
export type AiConnectionStatus = z.infer<typeof aiConnectionStatusSchema>;
export type AiOperationAudit = z.infer<typeof aiOperationAuditSchema>;
export type AiOperationAuditStatus = z.infer<typeof aiOperationAuditStatusSchema>;
