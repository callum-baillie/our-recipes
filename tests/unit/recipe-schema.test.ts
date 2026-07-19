import { describe, expect, it } from 'vitest';

import {
  joinRecipeTaxonomyValues,
  parseRecipeTaxonomyValues,
  recipeInputSchema,
  recipeLibraryQuerySchema,
  recipePreferenceInputSchema,
  recipeTagsUpdateSchema,
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

  it('normalizes multi-value categories and cuisines without breaking legacy strings', () => {
    expect(parseRecipeTaxonomyValues('Dinner; Main dish, dinner\nFamily table')).toEqual([
      'Dinner',
      'Main dish',
      'Family table',
    ]);
    expect(joinRecipeTaxonomyValues(['Italian', 'Mediterranean', 'italian'])).toBe(
      'Italian, Mediterranean',
    );

    const recipe = recipeInputSchema.parse({
      title: 'Sunday pasta',
      summary: '',
      servings: '4 servings',
      prepMinutes: 10,
      cookMinutes: 20,
      category: 'Dinner; Main dish, dinner',
      cuisine: 'Italian\nMediterranean',
      sourceName: '',
      sourceUrl: '',
      tags: [],
      ingredientGroups: [
        { name: '', ingredients: [{ quantity: 1, unit: 'lb', item: 'pasta', note: '' }] },
      ],
      instructionSections: [{ title: '', steps: ['Cook the pasta.'] }],
    });

    expect(recipe.category).toBe('Dinner, Main dish');
    expect(recipe.cuisine).toBe('Italian, Mediterranean');
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
      nutritionSaturatedFatGrams: 3,
      nutritionFiberGrams: 6,
      nutritionSugarGrams: 9,
      nutritionSodiumMilligrams: 410,
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
      nutritionSaturatedFatGrams: 3,
      nutritionFiberGrams: 6,
      nutritionSugarGrams: 9,
      nutritionSodiumMilligrams: 410,
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

  it('validates a strict revisioned tag-only update', () => {
    expect(
      recipeTagsUpdateSchema.parse({
        tags: [' Weeknight ', 'weeknight', 'Family'],
        expectedRevision: '2',
      }),
    ).toEqual({ tags: ['weeknight', 'family'], expectedRevision: 2 });
    expect(
      recipeTagsUpdateSchema.safeParse({ tags: [], expectedRevision: 1, title: 'Not allowed' })
        .success,
    ).toBe(false);
    expect(
      recipeTagsUpdateSchema.safeParse({
        tags: Array.from({ length: 21 }, (_, index) => `tag-${index}`),
        expectedRevision: 1,
      }).success,
    ).toBe(false);
  });
});
