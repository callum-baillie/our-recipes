import { describe, expect, it } from 'vitest';

import {
  formatScaledQuantity,
  parseServingCount,
  scaleIngredientMeasurement,
} from '@/lib/domain/ingredient-scaling';

describe('ingredient serving scaling', () => {
  it('reads a practical serving count and rejects placeholders', () => {
    expect(parseServingCount('4 servings')).toBe(4);
    expect(parseServingCount('2 1/2 bowls')).toBe(2.5);
    expect(parseServingCount('unknown')).toBeNull();
    expect(parseServingCount('Review servings')).toBeNull();
  });

  it('uses familiar kitchen measures when a cup fraction becomes too small', () => {
    expect(scaleIngredientMeasurement(0.25, 'cup', 0.5)).toEqual({
      quantity: '2',
      unit: 'tbsp',
    });
  });

  it('scales metric and unrecognized units without losing the measurement', () => {
    expect(scaleIngredientMeasurement(1, 'kg', 0.5)).toEqual({ quantity: '500', unit: 'g' });
    expect(scaleIngredientMeasurement(3, 'cloves', 0.5)).toEqual({
      quantity: '1 ½',
      unit: 'cloves',
    });
  });

  it('formats useful household fractions', () => {
    expect(formatScaledQuantity(0.125)).toBe('⅛');
    expect(formatScaledQuantity(1.333)).toBe('1 ⅓');
  });
});
