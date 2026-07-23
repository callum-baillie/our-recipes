import { z } from 'zod';
import { NUTRIENT_CODES } from '@/lib/domain/nutrition';

const text = (max: number) => z.string().trim().max(max);
const required = (max: number) => text(max).min(1);
const probability = z.number().finite().min(0).max(1);
const positive = z.number().finite().positive().max(1_000_000).nullable().default(null);
const nullableId = z.string().uuid().nullable().default(null);
export const nutrientCodeSchema = z.enum(NUTRIENT_CODES);

export const nutritionSourceInputSchema = z
  .object({
    id: required(160).optional(),
    sourceType: z.enum([
      'legacy_recipe',
      'manual',
      'provider',
      'laboratory',
      'calculated',
      'reference',
    ]),
    name: required(200),
    provider: text(160).default(''),
    version: text(120).default(''),
    sourceUrl: z.union([z.literal(''), z.url().max(2_000)]).default(''),
    citation: text(2_000).default(''),
    license: text(300).default(''),
    retrievedAt: z.date().nullable().default(null),
    priority: z.number().int().min(-1_000).max(1_000).default(0),
    metadata: z.record(z.string(), z.unknown()).default({}),
  })
  .strict();

export const nutrientValueInputSchema = z
  .object({
    nutrientCode: nutrientCodeSchema,
    amount: z.number().finite().min(0).max(1_000_000_000),
    confidence: probability.nullable().default(null),
    sourceNote: text(500).default(''),
  })
  .strict();

function unique(values: Array<{ nutrientCode: string }>, context: z.RefinementCtx) {
  const seen = new Set<string>();
  values.forEach((value, index) => {
    if (seen.has(value.nutrientCode))
      context.addIssue({
        code: 'custom',
        path: [index, 'nutrientCode'],
        message: `Duplicate nutrient ${value.nutrientCode}.`,
      });
    seen.add(value.nutrientCode);
  });
}

export const foodNutritionRecordInputSchema = z
  .object({
    productId: z.string().uuid(),
    sourceId: required(160),
    sourceRecordKey: text(300).default(''),
    basisType: z.enum(['per_100g', 'per_100ml', 'per_serving', 'per_unit']),
    basisAmount: z.number().finite().positive().max(1_000_000),
    basisUnit: required(30),
    servingWeightGrams: positive,
    densityGramsPerMilliliter: positive,
    pieceWeightGrams: positive,
    confidence: probability,
    completeness: probability,
    supersedesRecordId: nullableId,
    recordedByProfileId: nullableId,
    notes: text(2_000).default(''),
    values: z.array(nutrientValueInputSchema).min(1).max(NUTRIENT_CODES.length),
  })
  .strict()
  .superRefine((value, context) => {
    unique(value.values, context);
    if (value.basisType === 'per_100g' && (value.basisAmount !== 100 || value.basisUnit !== 'g'))
      context.addIssue({
        code: 'custom',
        path: ['basisAmount'],
        message: 'A per-100g record must use exactly 100 g.',
      });
    if (value.basisType === 'per_100ml' && (value.basisAmount !== 100 || value.basisUnit !== 'ml'))
      context.addIssue({
        code: 'custom',
        path: ['basisAmount'],
        message: 'A per-100ml record must use exactly 100 ml.',
      });
    if (value.basisType === 'per_serving' && value.servingWeightGrams === null)
      context.addIssue({
        code: 'custom',
        path: ['servingWeightGrams'],
        message: 'A per-serving record requires serving weight evidence.',
      });
    if (value.basisType === 'per_unit' && value.pieceWeightGrams === null)
      context.addIssue({
        code: 'custom',
        path: ['pieceWeightGrams'],
        message: 'A per-unit record requires piece-weight evidence.',
      });
  });

export const calculationVersionInputSchema = z
  .object({
    id: required(160).optional(),
    algorithm: required(160),
    version: required(80),
    energyFactorsVersion: required(120),
    retentionFactorsVersion: text(120).default(''),
    implementationDigest: required(200),
    metadata: z.record(z.string(), z.unknown()).default({}),
  })
  .strict();

export const recipeNutritionContributionInputSchema = z
  .object({
    recipeIngredientId: nullableId,
    productNutritionRecordId: nullableId,
    amountMultiplier: z.number().finite().min(0).max(1_000_000),
    ediblePortion: probability.default(1),
    drainedYield: probability.default(1),
    optionalIncluded: z.boolean().default(true),
    retentionFactors: z.partialRecord(nutrientCodeSchema, probability).default({}),
    confidence: probability,
    completeness: probability,
    missingReason: text(500).default(''),
  })
  .strict()
  .superRefine((value, context) => {
    if (value.productNutritionRecordId === null && !value.missingReason)
      context.addIssue({
        code: 'custom',
        path: ['missingReason'],
        message: 'A contribution without a food record must explain the missing evidence.',
      });
  });

export const recipeNutrientValueInputSchema = nutrientValueInputSchema
  .omit({ sourceNote: true })
  .extend({ completeness: probability.nullable().default(null) });
export const recipeNutritionCalculationInputSchema = z
  .object({
    recipeId: z.string().uuid(),
    recipeRevision: z.number().int().positive(),
    calculationVersionId: required(160),
    sourceId: required(160),
    sourceDigest: required(300),
    servingCount: positive,
    finalWeightGrams: positive,
    confidence: probability,
    completeness: probability,
    supersedesCalculationId: nullableId,
    calculatedByProfileId: nullableId,
    notes: text(2_000).default(''),
    contributions: z.array(recipeNutritionContributionInputSchema).max(500).default([]),
    values: z.array(recipeNutrientValueInputSchema).min(1).max(NUTRIENT_CODES.length),
  })
  .strict()
  .superRefine((value, context) => unique(value.values, context));

export type NutritionSourceInput = z.input<typeof nutritionSourceInputSchema>;
export type FoodNutritionRecordInput = z.input<typeof foodNutritionRecordInputSchema>;
export type CalculationVersionInput = z.input<typeof calculationVersionInputSchema>;
export type RecipeNutritionCalculationInput = z.input<typeof recipeNutritionCalculationInputSchema>;

export const LEGACY_RECIPE_NUTRIENT_COLUMNS = {
  energy_kcal: 'nutritionCalories',
  protein: 'nutritionProteinGrams',
  carbohydrate: 'nutritionCarbohydrateGrams',
  total_fat: 'nutritionFatGrams',
  saturated_fat: 'nutritionSaturatedFatGrams',
  fiber: 'nutritionFiberGrams',
  total_sugars: 'nutritionSugarGrams',
  sodium: 'nutritionSodiumMilligrams',
} as const;
