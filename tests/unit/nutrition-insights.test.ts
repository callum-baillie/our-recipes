import { describe, expect, it } from 'vitest';

import { evaluateNutritionInsights } from '@/lib/domain/nutrition-insights';

describe('deterministic Nutrition insights', () => {
  it('suppresses recommendations when days or coverage are inadequate', () => {
    const result = evaluateNutritionInsights({
      dailyAverages: { fiber: 12 },
      goals: [
        {
          nutrientCode: 'fiber',
          kind: 'minimum',
          value: 28,
          minimum: null,
          maximum: null,
          unit: 'g',
          sourceType: 'user_defined',
        },
      ],
      observedDays: 1,
      coverageByNutrient: { fiber: 0.9 },
    });
    expect(result.goals[0]?.status).toBe('insufficient_data');
    expect(result.suggestions).toEqual([]);
    expect(result.qualityMessage).toMatch(/at least 3 recorded days/iu);
  });

  it('produces calm food-first ideas and treats limits differently from minimums', () => {
    const result = evaluateNutritionInsights({
      dailyAverages: { fiber: 14, sodium: 2_800 },
      goals: [
        {
          nutrientCode: 'fiber',
          kind: 'minimum',
          value: 28,
          minimum: null,
          maximum: null,
          unit: 'g',
          sourceType: 'user_defined',
        },
        {
          nutrientCode: 'sodium',
          kind: 'limit',
          value: null,
          minimum: null,
          maximum: 2_300,
          unit: 'mg',
          sourceType: 'reference',
        },
      ],
      observedDays: 5,
      coverageByNutrient: { fiber: 0.8, sodium: 0.8 },
    });
    expect(result.goals.map((goal) => goal.status)).toEqual(['below', 'above']);
    expect(result.suggestions).toEqual(
      expect.arrayContaining([
        expect.objectContaining({ nutrientCode: 'fiber', tone: 'consider_more' }),
        expect.objectContaining({ nutrientCode: 'sodium', tone: 'consider_less' }),
      ]),
    );
    expect(JSON.stringify(result)).not.toMatch(/diagnos|disease|danger/iu);
  });

  it('does not let a well-covered nutrient authorize a poorly covered nutrient', () => {
    const result = evaluateNutritionInsights({
      dailyAverages: { energy_kcal: 2_000, fiber: 10 },
      goals: [
        {
          nutrientCode: 'energy_kcal',
          kind: 'target',
          value: 2_000,
          minimum: null,
          maximum: null,
          unit: 'kcal',
          sourceType: 'user_defined',
        },
        {
          nutrientCode: 'fiber',
          kind: 'minimum',
          value: 28,
          minimum: null,
          maximum: null,
          unit: 'g',
          sourceType: 'user_defined',
        },
      ],
      observedDays: 5,
      coverageByNutrient: { energy_kcal: 0.9, fiber: 0.2 },
    });
    expect(result.goals.map((goal) => goal.status)).toEqual(['within', 'insufficient_data']);
    expect(result.suggestions).toEqual([]);
  });
});
