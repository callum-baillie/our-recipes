import { describe, expect, it } from 'vitest';

import { JsonLdValidationError } from '@/lib/domain/jsonld';
import { createJsonLdDraft, findJsonLdCandidates } from '@/lib/services/jsonld-service';

const source = JSON.stringify({
  '@context': 'https://schema.org',
  '@graph': [
    {
      '@type': 'WebSite',
      name: 'Example kitchen',
    },
    {
      '@type': 'Recipe',
      name: 'Roasted tomatoes',
      description: 'Sweet, slow-roasted tomatoes.',
      recipeYield: '4 servings',
      prepTime: 'PT15M',
      cookTime: 'PT1H',
      recipeCategory: 'Side dish',
      recipeCuisine: 'Italian',
      keywords: 'summer, tomatoes',
      nutrition: {
        '@type': 'NutritionInformation',
        calories: '230 kcal',
        proteinContent: '5 g',
        carbohydrateContent: '22 g',
        fatContent: '14 g',
        saturatedFatContent: '3 g',
        fiberContent: '6 g',
        sugarContent: '9 g',
        sodiumContent: '410 mg',
      },
      recipeIngredient: [
        {
          '@type': 'ItemList',
          name: 'For the pan',
          itemListElement: ['2 tbsp olive oil', '500 g cherry tomatoes'],
        },
      ],
      recipeInstructions: [
        {
          '@type': 'HowToSection',
          name: 'Roast',
          itemListElement: [{ '@type': 'HowToStep', text: 'Roast until jammy.' }],
        },
      ],
      image: 'https://example.test/tomatoes.jpg',
    },
  ],
});

describe('Schema.org JSON-LD portability', () => {
  it('finds bounded Recipe candidates in an @graph and maps a selected candidate locally', () => {
    expect(findJsonLdCandidates(source)).toEqual([
      expect.objectContaining({ index: 0, title: 'Roasted tomatoes' }),
    ]);
    const draft = createJsonLdDraft(source, 0);
    expect(draft.recipe).toMatchObject({
      title: 'Roasted tomatoes',
      prepMinutes: 15,
      cookMinutes: 60,
      servings: '4 servings',
      tags: ['summer', 'tomatoes'],
      nutritionCalories: 230,
      nutritionProteinGrams: 5,
      nutritionCarbohydrateGrams: 22,
      nutritionFatGrams: 14,
      nutritionSaturatedFatGrams: 3,
      nutritionFiberGrams: 6,
      nutritionSugarGrams: 9,
      nutritionSodiumMilligrams: 410,
      ingredientGroups: [
        {
          name: 'For the pan',
          ingredients: [
            { quantity: 2, unit: 'tbsp', item: 'olive oil' },
            { quantity: 500, unit: 'g', item: 'cherry tomatoes' },
          ],
        },
      ],
      instructionSections: [{ title: 'Roast', steps: ['Roast until jammy.'] }],
    });
    expect(draft.warnings).toContain('image is not imported into a household recipe.');
    expect(draft.warnings).toContain(
      'Nutrition values were imported per serving and should be reviewed.',
    );
  });

  it('refuses non-JSON input and does not treat a URL as a fetch instruction', () => {
    expect(() => findJsonLdCandidates('https://example.test/recipe.jsonld')).toThrow(
      JsonLdValidationError,
    );
    expect(() => findJsonLdCandidates('{"@context":"https://schema.org","@type":"Thing"}')).toThrow(
      'No Schema.org Recipe nodes',
    );
  });
});
