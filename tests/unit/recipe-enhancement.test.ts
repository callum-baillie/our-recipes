import { describe, expect, it } from 'vitest';
import { aiRecipeImprovementRequestSchema } from '@/lib/domain/ai';
import { emptyRecipeInput, recipeInputSchema } from '@/lib/domain/recipe';
import { applyRecipeEnhancement, recipeEnhancementDiff } from '@/lib/domain/recipe-enhancement';

const recipe = recipeInputSchema.parse({
  ...emptyRecipeInput,
  title: 'Soup',
  servings: '4',
  sourceName: 'Family notebook',
  sharedNotes: 'Julia likes this.',
  ingredientGroups: [
    {
      name: '',
      ingredients: [
        {
          quantity: 2,
          unit: 'cups',
          item: 'large tomatoes',
          note: '',
          shoppingCategory: 'Fresh produce',
        },
      ],
    },
  ],
  instructionSections: [{ title: '', steps: ['Simmer.'] }],
});

describe('recipe enhancement review', () => {
  it('shows readable changes, including normalization, steps, and estimated nutrition', () => {
    const after = {
      ...recipe,
      servings: '6',
      nutritionCalories: 120,
      ingredientGroups: [
        { name: '', ingredients: [{ ...recipe.ingredientGroups[0].ingredients[0], unit: 'cup' }] },
      ],
      instructionSections: [{ title: 'Cook', steps: ['Simmer until tender.'] }],
    };
    expect(recipeEnhancementDiff(recipe, after).map((change) => change.field)).toEqual([
      'servings',
      'ingredientGroups',
      'instructionSections',
      'nutritionCalories',
    ]);
    expect(recipeEnhancementDiff(recipe, after)[1]).toMatchObject({
      before: '2 cups large tomatoes (Fresh produce)',
      after: '2 cup large tomatoes (Fresh produce)',
    });
    expect(recipeEnhancementDiff(recipe, after)[2].after).toBe('Cook\n1. Simmer until tender.');
  });
  it('only applies selected fields and preserves source credits, status, and shared notes', () => {
    const after = {
      ...recipe,
      servings: '6',
      title: 'Better soup',
      sourceName: 'AI',
      sharedNotes: '',
      status: 'trash' as const,
    };
    expect(applyRecipeEnhancement(recipe, after, ['servings'])).toEqual({
      ...recipe,
      servings: '6',
    });
    expect(recipeEnhancementDiff(recipe, { ...recipe, sourceName: 'AI' })).toEqual([]);
    expect(recipeEnhancementDiff(recipe, recipe)).toEqual([]);
  });
  it('does not apply nutrition when its serving changes are rejected', () => {
    const after = { ...recipe, servings: '6', nutritionCalories: 120 };
    expect(applyRecipeEnhancement(recipe, after, ['nutritionCalories'])).toEqual(recipe);
    expect(applyRecipeEnhancement(recipe, after, ['servings', 'nutritionCalories'])).toEqual(after);
  });
  it('requires paid confirmation and a current revision for enhancement', () => {
    const request = { confirm: true, expectedRevision: 1, recipe, mode: 'enhance' };
    expect(aiRecipeImprovementRequestSchema.safeParse(request).success).toBe(true);
    expect(aiRecipeImprovementRequestSchema.safeParse({ ...request, confirm: false }).success).toBe(
      false,
    );
    expect(
      aiRecipeImprovementRequestSchema.safeParse({ ...request, expectedRevision: 0 }).success,
    ).toBe(false);
    expect(
      aiRecipeImprovementRequestSchema.safeParse({ ...request, mode: 'unknown' }).success,
    ).toBe(false);
    expect(aiRecipeImprovementRequestSchema.safeParse({ ...request, extra: true }).success).toBe(
      false,
    );
  });
});
