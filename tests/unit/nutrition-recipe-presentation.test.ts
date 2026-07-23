import { describe, expect, it } from 'vitest';

import { presentRecipeNutrition } from '@/lib/domain/nutrition-recipe-presentation';

const calculation = {
  id: 'calculation',
  recipeRevision: 2,
  revision: 3,
  servingCount: 4,
  confidence: 0.8,
  completeness: 0.7,
  createdAt: new Date('2026-07-19T00:00:00Z'),
  source: { name: 'Ingredient calculation', provider: 'Our Recipes', version: '1' },
  calculationVersion: {
    algorithm: 'our_recipes_recipe_nutrition',
    version: '1',
    energyFactorsVersion: 'general-4-4-9-7-v1',
  },
  values: [
    { nutrientCode: 'energy_kcal', amount: 800, confidence: 0.8, completeness: 0.7 },
    { nutrientCode: 'protein', amount: 40, confidence: 0.9, completeness: 0.8 },
    { nutrientCode: 'carbohydrate', amount: 80, confidence: 0.9, completeness: 0.8 },
    { nutrientCode: 'total_fat', amount: 20, confidence: 0.9, completeness: 0.8 },
    { nutrientCode: 'fiber', amount: 16, confidence: 0.9, completeness: 0.8 },
    { nutrientCode: 'sodium', amount: 1200, confidence: 0.9, completeness: 0.8 },
    { nutrientCode: 'vitamin_c', amount: 10, confidence: 0.7, completeness: 0.5 },
  ],
  notes: JSON.stringify({ energyMethod: 'macro-fallback', warnings: ['Partial source coverage.'] }),
};

describe('normalized recipe Nutrition presentation', () => {
  it('derives concise whole-recipe and per-serving values with quality metadata', () => {
    const result = presentRecipeNutrition(2, calculation);
    expect(result).toMatchObject({
      status: 'current',
      energyMethod: 'macro-fallback',
      completeness: 0.7,
    });
    expect(result.values).toEqual(
      expect.arrayContaining([
        expect.objectContaining({ nutrientCode: 'energy_kcal', total: 800, perServing: 200 }),
        expect.objectContaining({ nutrientCode: 'protein', total: 40, perServing: 10 }),
        expect.objectContaining({ nutrientCode: 'carbohydrate', perServing: 20 }),
        expect.objectContaining({ nutrientCode: 'total_fat', perServing: 5 }),
        expect.objectContaining({ nutrientCode: 'fiber', perServing: 4 }),
        expect.objectContaining({ nutrientCode: 'sodium', perServing: 300 }),
      ]),
    );
    expect(result.values).toHaveLength(6);
    expect(result.values.some((value) => value.nutrientCode === 'vitamin_c')).toBe(false);
  });

  it('marks old recipe revisions stale and never invents missing per-serving values', () => {
    const stale = presentRecipeNutrition(3, { ...calculation, servingCount: null });
    expect(stale.status).toBe('stale');
    expect(stale.warnings[0]).toContain('not current revision 3');
    expect(stale.values[0]?.perServing).toBeNull();
    expect(presentRecipeNutrition(3, null)).toMatchObject({
      status: 'unavailable',
      values: [],
      completeness: null,
    });
  });
});
