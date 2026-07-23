import { describe, expect, it } from 'vitest';

import {
  NUTRITION_VISUAL_KEYS,
  nutritionVisuals,
  resolveNutritionVisual,
} from '@/lib/domain/nutrition-visuals';

describe('Nutrition visual language', () => {
  it('keeps macros and common categories on stable semantic colors', () => {
    expect(resolveNutritionVisual('energy_kcal').key).toBe('energy');
    expect(resolveNutritionVisual('carbohydrate').key).toBe('carbohydrate');
    expect(resolveNutritionVisual('total_fat').key).toBe('fat');
    expect(resolveNutritionVisual('protein').key).toBe('protein');
    expect(resolveNutritionVisual('fiber').key).toBe('fiber');
    expect(resolveNutritionVisual('sodium').key).toBe('mineral');
    expect(resolveNutritionVisual('vitamin_c', 'vitamin').key).toBe('grain');
  });

  it('provides a labeled fallback and a complete token set', () => {
    expect(resolveNutritionVisual('unmapped_nutrient')).toMatchObject({
      key: 'other',
      label: 'Other nutrients',
      color: 'var(--nutrition-other)',
    });
    expect(nutritionVisuals().map((visual) => visual.key)).toEqual(NUTRITION_VISUAL_KEYS);
  });
});
