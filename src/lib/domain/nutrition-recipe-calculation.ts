import { z } from 'zod';

import { findInventoryUnit, normalizeInventoryUnit } from '@/lib/domain/inventory-units';
import { NUTRIENT_CODES } from '@/lib/domain/nutrition';

const probability = z.number().finite().min(0).max(1);
const positive = z.number().finite().positive().max(1_000_000);
const nullablePositive = positive.nullable().default(null);
const uuid = z.string().uuid();
const boundedFactor = z.number().finite().positive().max(1);

export const manualFoodNutritionRecordSchema = z
  .object({
    sourceRecordKey: z.string().trim().max(300).default(''),
    basisType: z.enum(['per_100g', 'per_100ml', 'per_serving', 'per_unit']),
    basisAmount: positive,
    basisUnit: z.string().trim().min(1).max(30),
    servingWeightGrams: nullablePositive,
    densityGramsPerMilliliter: nullablePositive,
    pieceWeightGrams: nullablePositive,
    confidence: probability,
    completeness: probability,
    supersedesRecordId: z.string().uuid().nullable().default(null),
    notes: z.string().trim().max(2_000).default(''),
    values: z
      .array(
        z
          .object({
            nutrientCode: z.enum(NUTRIENT_CODES),
            amount: z.number().finite().min(0).max(1_000_000_000),
            confidence: probability.nullable().default(null),
            sourceNote: z.string().trim().max(500).default(''),
          })
          .strict(),
      )
      .min(1)
      .max(NUTRIENT_CODES.length),
  })
  .strict()
  .superRefine((value, context) => {
    const seen = new Set<string>();
    value.values.forEach((item, index) => {
      if (seen.has(item.nutrientCode)) {
        context.addIssue({
          code: 'custom',
          path: ['values', index, 'nutrientCode'],
          message: `Duplicate nutrient ${item.nutrientCode}.`,
        });
      }
      seen.add(item.nutrientCode);
    });
    if (value.basisType === 'per_100g' && (value.basisAmount !== 100 || value.basisUnit !== 'g')) {
      context.addIssue({
        code: 'custom',
        path: ['basisAmount'],
        message: 'A per-100g record must use exactly 100 g.',
      });
    }
    if (
      value.basisType === 'per_100ml' &&
      (value.basisAmount !== 100 || value.basisUnit !== 'ml')
    ) {
      context.addIssue({
        code: 'custom',
        path: ['basisAmount'],
        message: 'A per-100ml record must use exactly 100 ml.',
      });
    }
    if (value.basisType === 'per_serving' && value.servingWeightGrams === null) {
      context.addIssue({
        code: 'custom',
        path: ['servingWeightGrams'],
        message: 'A per-serving record requires serving-weight evidence.',
      });
    }
    if (value.basisType === 'per_unit' && value.pieceWeightGrams === null) {
      context.addIssue({
        code: 'custom',
        path: ['pieceWeightGrams'],
        message: 'A per-unit record requires piece-weight evidence.',
      });
    }
  });

export const recipeCalculationRequestSchema = z
  .object({
    includedOptionalIngredientIds: z.array(uuid).max(500).default([]),
    excludedIngredientIds: z.array(uuid).max(500).default([]),
    substitutions: z
      .array(
        z
          .object({
            recipeIngredientId: uuid,
            productId: uuid,
          })
          .strict(),
      )
      .max(500)
      .default([]),
    preparationFactors: z
      .array(
        z
          .object({
            recipeIngredientId: uuid,
            ediblePortion: boundedFactor.default(1),
            drainedYield: boundedFactor.default(1),
            evidenceNote: z.string().trim().min(1).max(500),
          })
          .strict(),
      )
      .max(500)
      .default([]),
    finalWeightGrams: nullablePositive,
  })
  .strict()
  .superRefine((value, context) => {
    const unique = (
      values: readonly string[],
      path: 'includedOptionalIngredientIds' | 'excludedIngredientIds',
    ) => {
      if (new Set(values).size !== values.length) {
        context.addIssue({
          code: 'custom',
          path: [path],
          message: 'Ingredient IDs must be unique.',
        });
      }
    };
    unique(value.includedOptionalIngredientIds, 'includedOptionalIngredientIds');
    unique(value.excludedIngredientIds, 'excludedIngredientIds');
    const excluded = new Set(value.excludedIngredientIds);
    if (value.includedOptionalIngredientIds.some((id) => excluded.has(id))) {
      context.addIssue({
        code: 'custom',
        path: ['excludedIngredientIds'],
        message: 'An ingredient cannot be both included and excluded.',
      });
    }
    for (const [path, ids] of [
      ['substitutions', value.substitutions.map((item) => item.recipeIngredientId)],
      ['preparationFactors', value.preparationFactors.map((item) => item.recipeIngredientId)],
    ] as const) {
      if (new Set(ids).size !== ids.length) {
        context.addIssue({
          code: 'custom',
          path: [path],
          message: 'Each ingredient may appear once.',
        });
      }
      if (ids.some((id) => excluded.has(id))) {
        context.addIssue({
          code: 'custom',
          path: [path],
          message: 'Excluded ingredients cannot also be adjusted.',
        });
      }
    }
  });

export const recipeConsumptionRequestSchema = z
  .object({
    recipeCalculationId: uuid,
    servingCount: nullablePositive,
    portionWeightGrams: nullablePositive,
    occurredAt: z.string().datetime({ offset: true }),
    mealSlot: z.enum(['breakfast', 'lunch', 'dinner', 'snack', 'other']),
    supersedesIntakeRevisionId: z.string().uuid().nullable().default(null),
    revisionReason: z.string().trim().max(500).default(''),
  })
  .strict()
  .superRefine((value, context) => {
    if ((value.servingCount === null) === (value.portionWeightGrams === null)) {
      context.addIssue({
        code: 'custom',
        path: ['servingCount'],
        message: 'Provide exactly one serving count or weighed portion.',
      });
    }
    if (value.supersedesIntakeRevisionId && !value.revisionReason) {
      context.addIssue({
        code: 'custom',
        path: ['revisionReason'],
        message: 'A recipe correction requires an audit reason.',
      });
    }
  });

export type FoodRecordBasis = {
  basisType: 'per_100g' | 'per_100ml' | 'per_serving' | 'per_unit';
  basisAmount: number;
  basisUnit: string;
  servingWeightGrams: number | null;
  densityGramsPerMilliliter: number | null;
  pieceWeightGrams: number | null;
};

export type IngredientMultiplierResult =
  | { supported: true; multiplier: number; method: string }
  | { supported: false; multiplier: 0; missingReason: string };

function baseAmount(quantity: number, unit: string) {
  const matched = findInventoryUnit(unit);
  return matched
    ? {
        amount: quantity * matched.baseFactor,
        dimension: matched.dimension,
        family: matched.family,
      }
    : { amount: quantity, dimension: 'unknown' as const, family: normalizeInventoryUnit(unit) };
}

export function strictRecipeServingCount(value: string): number | null {
  const match = /^(?:(?:serves?|makes?|yield)\s*:?[\s]*)?(\d+(?:\.\d+)?)(?:\s+servings?)?$/iu.exec(
    value.trim(),
  );
  if (!match) return null;
  const amount = Number(match[1]);
  return Number.isFinite(amount) && amount > 0 && amount <= 1_000 ? amount : null;
}

export function ingredientFoodRecordMultiplier(
  quantity: number | null,
  unit: string,
  record: FoodRecordBasis,
): IngredientMultiplierResult {
  if (quantity === null || !Number.isFinite(quantity) || quantity <= 0) {
    return { supported: false, multiplier: 0, missingReason: 'Ingredient quantity is missing.' };
  }
  const ingredient = baseAmount(quantity, unit);
  const density = record.densityGramsPerMilliliter;
  const pieceWeight = record.pieceWeightGrams;
  let grams: number | null = null;
  let milliliters: number | null = null;
  if (ingredient.dimension === 'mass') grams = ingredient.amount;
  if (ingredient.dimension === 'volume') milliliters = ingredient.amount;
  if (ingredient.dimension === 'count' && ingredient.family === 'each' && pieceWeight) {
    grams = ingredient.amount * pieceWeight;
  }
  if (grams === null && milliliters !== null && density) grams = milliliters * density;
  if (milliliters === null && grams !== null && density) milliliters = grams / density;

  if (record.basisType === 'per_100g') {
    return grams === null
      ? {
          supported: false,
          multiplier: 0,
          missingReason: 'This ingredient needs mass or explicit density/piece-weight evidence.',
        }
      : { supported: true, multiplier: grams / 100, method: 'grams-per-100g' };
  }
  if (record.basisType === 'per_100ml') {
    return milliliters === null
      ? {
          supported: false,
          multiplier: 0,
          missingReason: 'This ingredient needs volume or explicit density evidence.',
        }
      : { supported: true, multiplier: milliliters / 100, method: 'milliliters-per-100ml' };
  }
  if (record.basisType === 'per_serving') {
    if (record.basisAmount !== 1 || !record.servingWeightGrams) {
      return {
        supported: false,
        multiplier: 0,
        missingReason: 'Per-serving scaling requires one serving with explicit serving weight.',
      };
    }
    return grams === null
      ? {
          supported: false,
          multiplier: 0,
          missingReason: 'Per-serving scaling needs mass or density/piece-weight evidence.',
        }
      : {
          supported: true,
          multiplier: grams / record.servingWeightGrams,
          method: 'serving-weight',
        };
  }

  const reference = baseAmount(record.basisAmount, record.basisUnit);
  if (
    ingredient.dimension !== 'unknown' &&
    reference.dimension === ingredient.dimension &&
    reference.family === ingredient.family
  ) {
    return {
      supported: true,
      multiplier: ingredient.amount / reference.amount,
      method: 'compatible-unit-basis',
    };
  }
  if (
    ingredient.dimension === 'unknown' &&
    normalizeInventoryUnit(unit) === normalizeInventoryUnit(record.basisUnit)
  ) {
    return {
      supported: true,
      multiplier: quantity / record.basisAmount,
      method: 'exact-custom-unit-basis',
    };
  }
  if (record.basisAmount === 1 && record.pieceWeightGrams && grams !== null) {
    return {
      supported: true,
      multiplier: grams / record.pieceWeightGrams,
      method: 'piece-weight',
    };
  }
  return {
    supported: false,
    multiplier: 0,
    missingReason:
      'Unit and reference basis are incompatible without explicit conversion evidence.',
  };
}

export type ManualFoodNutritionRecordInput = z.input<typeof manualFoodNutritionRecordSchema>;
export type RecipeCalculationRequest = z.input<typeof recipeCalculationRequestSchema>;
export type RecipeConsumptionRequest = z.input<typeof recipeConsumptionRequestSchema>;
