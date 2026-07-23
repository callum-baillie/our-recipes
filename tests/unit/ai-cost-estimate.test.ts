import { describe, expect, it } from 'vitest';

import {
  LOW_SQUARE_RECIPE_IMAGE_ESTIMATE_USD,
  estimateAiMealPlanCost,
} from '@/lib/domain/ai-cost-estimate';

describe('AI meal-plan cost estimates', () => {
  it('separates input, output, and optional image estimates', () => {
    const estimate = estimateAiMealPlanCost({
      model: 'gpt-5.6-terra',
      startDate: '2026-07-20',
      endDate: '2026-07-26',
      mealSlots: ['breakfast', 'lunch', 'dinner'],
      profileCount: 2,
      allowRepeatingMeals: false,
      planLeftovers: false,
      generateRecipeImages: true,
    });

    expect(estimate.inputUsd).toBeGreaterThan(0);
    expect(estimate.outputUsd).toBeGreaterThan(estimate.inputUsd ?? 0);
    expect(estimate.imageCount).toBe(21);
    expect(estimate.imageUsd).toBe(21 * LOW_SQUARE_RECIPE_IMAGE_ESTIMATE_USD);
    expect(estimate.totalUsd).toBeCloseTo(
      (estimate.inputUsd ?? 0) + (estimate.outputUsd ?? 0) + estimate.imageUsd,
    );
  });

  it('reduces distinct recipe and image counts for linked leftovers', () => {
    const estimate = estimateAiMealPlanCost({
      model: 'gpt-5.6-terra',
      startDate: '2026-07-20',
      endDate: '2026-07-26',
      mealSlots: ['lunch', 'dinner'],
      profileCount: 1,
      allowRepeatingMeals: false,
      planLeftovers: true,
      generateRecipeImages: true,
    });

    expect(estimate.imageCount).toBe(8);
  });

  it('keeps token estimates visible for a custom model without inventing prices', () => {
    const estimate = estimateAiMealPlanCost({
      model: 'custom-model',
      startDate: '2026-07-20',
      endDate: '2026-07-20',
      mealSlots: ['dinner'],
      profileCount: 1,
      allowRepeatingMeals: false,
      planLeftovers: false,
      generateRecipeImages: false,
    });

    expect(estimate.inputTokens).toBeGreaterThan(0);
    expect(estimate.inputUsd).toBeNull();
    expect(estimate.totalUsd).toBeNull();
  });
});
