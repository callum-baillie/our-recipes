import { describe, expect, it } from 'vitest';

import {
  ingredientFoodRecordMultiplier,
  recipeCalculationRequestSchema,
  recipeConsumptionRequestSchema,
  strictRecipeServingCount,
} from '@/lib/domain/nutrition-recipe-calculation';

const per100g = {
  basisType: 'per_100g' as const,
  basisAmount: 100,
  basisUnit: 'g',
  servingWeightGrams: null,
  densityGramsPerMilliliter: null,
  pieceWeightGrams: null,
};

describe('recipe nutrition evidence-backed conversion', () => {
  it('parses only unambiguous configured recipe yields', () => {
    expect(strictRecipeServingCount('4')).toBe(4);
    expect(strictRecipeServingCount('Serves 4')).toBe(4);
    expect(strictRecipeServingCount('4 servings')).toBe(4);
    expect(strictRecipeServingCount('4-6')).toBeNull();
    expect(strictRecipeServingCount('about 4')).toBeNull();
    expect(strictRecipeServingCount('family size')).toBeNull();
  });

  it('uses exact mass factors and explicit density for volume-to-mass conversion', () => {
    expect(ingredientFoodRecordMultiplier(0.5, 'kg', per100g)).toMatchObject({
      supported: true,
      multiplier: 5,
      method: 'grams-per-100g',
    });
    expect(
      ingredientFoodRecordMultiplier(250, 'ml', {
        ...per100g,
        densityGramsPerMilliliter: 0.8,
      }),
    ).toMatchObject({ supported: true, multiplier: 2 });
    expect(ingredientFoodRecordMultiplier(250, 'ml', per100g)).toMatchObject({
      supported: false,
      missingReason: expect.stringContaining('density'),
    });
  });

  it('supports compatible count bases and rejects package-family guesses', () => {
    const unitRecord = {
      basisType: 'per_unit' as const,
      basisAmount: 1,
      basisUnit: 'each',
      servingWeightGrams: null,
      densityGramsPerMilliliter: null,
      pieceWeightGrams: 50,
    };
    expect(ingredientFoodRecordMultiplier(1, 'dozen', unitRecord)).toMatchObject({
      supported: true,
      multiplier: 12,
    });
    expect(ingredientFoodRecordMultiplier(1, 'can', unitRecord)).toMatchObject({
      supported: false,
    });
  });

  it('requires explicit serving weight and quantity evidence', () => {
    expect(
      ingredientFoodRecordMultiplier(120, 'g', {
        basisType: 'per_serving',
        basisAmount: 1,
        basisUnit: 'serving',
        servingWeightGrams: 60,
        densityGramsPerMilliliter: null,
        pieceWeightGrams: null,
      }),
    ).toMatchObject({ supported: true, multiplier: 2 });
    expect(ingredientFoodRecordMultiplier(null, 'g', per100g)).toMatchObject({
      supported: false,
      missingReason: 'Ingredient quantity is missing.',
    });
  });

  it('validates preparation identity conflicts and exactly one consumption basis', () => {
    const ingredientId = '11111111-1111-4111-8111-111111111111';
    expect(() =>
      recipeCalculationRequestSchema.parse({
        includedOptionalIngredientIds: [ingredientId],
        excludedIngredientIds: [ingredientId],
      }),
    ).toThrow();
    expect(() =>
      recipeCalculationRequestSchema.parse({
        preparationFactors: [
          {
            recipeIngredientId: ingredientId,
            ediblePortion: 0.8,
            drainedYield: 0.5,
            evidenceNote: '',
          },
        ],
      }),
    ).toThrow();
    const base = {
      recipeCalculationId: '22222222-2222-4222-8222-222222222222',
      occurredAt: '2026-07-19T12:00:00Z',
      mealSlot: 'lunch',
    };
    expect(() =>
      recipeConsumptionRequestSchema.parse({
        ...base,
        servingCount: 1,
        portionWeightGrams: 100,
      }),
    ).toThrow();
    expect(
      recipeConsumptionRequestSchema.parse({ ...base, portionWeightGrams: 100 }),
    ).toMatchObject({ servingCount: null, portionWeightGrams: 100 });
  });
});
