import { describe, expect, it } from 'vitest';

import {
  recipeInputSchema,
  recipeLibraryQuerySchema,
  recipePreferenceInputSchema,
} from '@/lib/domain/recipe';

describe('recipeInputSchema', () => {
  it('normalizes duplicate tags and preserves structured cooking content', () => {
    const recipe = recipeInputSchema.parse({
      title: 'Tomato soup',
      summary: '',
      servings: '4 bowls',
      prepMinutes: 10,
      cookMinutes: 25,
      sourceName: '',
      sourceUrl: '',
      tags: ['Weeknight', 'weeknight'],
      ingredientGroups: [
        { name: '', ingredients: [{ quantity: '2', unit: 'tbsp', item: 'olive oil', note: '' }] },
      ],
      instructionSections: [{ title: '', steps: ['Simmer.'] }],
    });
    expect(recipe.tags).toEqual(['weeknight']);
    expect(recipe.ingredientGroups[0]?.ingredients[0]?.quantity).toBe(2);
  });

  it('supplies additive metadata defaults and accepts multiple recipe sections', () => {
    const recipe = recipeInputSchema.parse({
      title: 'Layered lasagna',
      summary: '',
      servings: '6 servings',
      prepMinutes: 20,
      cookMinutes: 45,
      sourceName: '',
      sourceUrl: '',
      tags: [],
      ingredientGroups: [
        {
          name: 'Sauce',
          ingredients: [{ quantity: 1, unit: 'jar', item: 'tomato sauce', note: '' }],
        },
        {
          name: 'Pasta',
          ingredients: [{ quantity: 12, unit: '', item: 'lasagna sheets', note: '' }],
        },
      ],
      instructionSections: [
        { title: 'Prepare', steps: ['Warm the sauce.'] },
        { title: 'Bake', steps: ['Layer and bake.'] },
      ],
    });
    expect(recipe).toMatchObject({ status: 'active', restMinutes: 0, difficulty: '' });
    expect(recipe.ingredientGroups).toHaveLength(2);
    expect(recipe.instructionSections).toHaveLength(2);
  });

  it('normalizes bounded rich metadata without treating nutrition as a provider lookup', () => {
    const recipe = recipeInputSchema.parse({
      title: 'Roasted tomato soup',
      summary: '',
      servings: '4 bowls',
      prepMinutes: 10,
      cookMinutes: 25,
      sourceName: 'Family notebook',
      sourceUrl: '',
      originalAuthor: 'Maya',
      cookingMethod: 'oven-roasted',
      equipment: ['Sheet pan', 'Immersion blender', 'Sheet pan'],
      nutritionCalories: '230',
      nutritionProteinGrams: 5,
      nutritionCarbohydrateGrams: '',
      nutritionFatGrams: 14,
      nutritionFiberGrams: 6,
      tags: [],
      ingredientGroups: [
        { name: '', ingredients: [{ quantity: 1, unit: 'kg', item: 'tomatoes', note: '' }] },
      ],
      instructionSections: [{ title: '', steps: ['Roast and blend.'] }],
    });
    expect(recipe.equipment).toEqual(['Sheet pan', 'Immersion blender']);
    expect(recipe).toMatchObject({
      originalAuthor: 'Maya',
      cookingMethod: 'oven-roasted',
      nutritionCalories: 230,
      nutritionProteinGrams: 5,
      nutritionFatGrams: 14,
      nutritionFiberGrams: 6,
    });
    expect(recipePreferenceInputSchema.parse({ rating: '5', note: 'Use less salt.' })).toEqual({
      rating: 5,
      note: 'Use less salt.',
    });
    expect(recipePreferenceInputSchema.safeParse({ rating: 6, note: '' }).success).toBe(false);
  });

  it('accepts bounded library facets and safe sort choices', () => {
    expect(
      recipeLibraryQuerySchema.parse({
        q: 'tomato',
        status: 'archived',
        sort: 'highest-rated',
        favorite: 'true',
        maxTotalMinutes: '45',
      }),
    ).toMatchObject({ status: 'archived', sort: 'highest-rated', maxTotalMinutes: 45, page: 1 });
  });
});
