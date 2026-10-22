import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

import { resetDatabaseForTests } from '@/lib/db/client';
import { completeSetup } from '@/lib/services/household-service';
import { exportRecipeAsJsonLd, createJsonLdDraft } from '@/lib/services/jsonld-service';
import { createRecipe } from '@/lib/services/recipe-service';

describe('JSON-LD recipe export', () => {
  beforeEach(() => {
    vi.stubEnv('DATABASE_URL', ':memory:');
    resetDatabaseForTests();
  });

  afterEach(() => {
    resetDatabaseForTests();
    vi.unstubAllEnvs();
  });

  it('emits a deterministic Schema.org Recipe document without private household data', () => {
    const profile = completeSetup({
      householdName: 'Sunday suppers',
      appName: 'Our Recipes',
      profile: {
        displayName: 'Maya',
        color: '#637A45',
        avatarUrl: '',
        units: 'imperial',
        temperatureUnit: 'F',
        locale: 'en-US',
        timezone: 'America/Los_Angeles',
      },
    }).profiles[0]!;
    const recipe = createRecipe(
      {
        title: 'Lemon pasta',
        summary: 'A bright weeknight bowl.',
        status: 'active',
        servings: '4 servings',
        prepMinutes: 10,
        cookMinutes: 15,
        restMinutes: 5,
        difficulty: 'Easy',
        cuisine: 'Italian',
        category: 'Dinner',
        tips: 'Save pasta water.',
        sharedNotes: 'Maya likes extra lemon.',
        sourceName: 'Family notes',
        sourceUrl: 'https://example.test/lemon-pasta',
        nutritionCalories: 230,
        nutritionProteinGrams: 5,
        nutritionCarbohydrateGrams: 22,
        nutritionFatGrams: 14,
        nutritionSaturatedFatGrams: 3,
        nutritionFiberGrams: 6,
        nutritionSugarGrams: 9,
        nutritionSodiumMilligrams: 410,
        tags: ['weeknight', 'pasta'],
        ingredientGroups: [
          {
            name: 'Pasta',
            ingredients: [{ quantity: 2, unit: 'tbsp', item: 'olive oil', note: '' }],
          },
        ],
        instructionSections: [{ title: 'Cook', steps: ['Toss and serve.'] }],
      },
      profile.id,
    );

    const document = exportRecipeAsJsonLd(recipe.id);
    expect(document).toEqual({
      '@context': 'https://schema.org',
      '@type': 'Recipe',
      '@id': `urn:uuid:${recipe.id}`,
      name: 'Lemon pasta',
      description: 'A bright weeknight bowl.',
      recipeYield: '4 servings',
      additionalProperty: [
        {
          '@type': 'PropertyValue',
          name: 'Bòrd recipe method metadata',
          value: JSON.stringify({ restMinutes: 5, equipmentRequirements: [] }),
        },
      ],
      prepTime: 'PT10M',
      cookTime: 'PT15M',
      totalTime: 'PT30M',
      recipeCategory: 'Dinner',
      recipeCuisine: 'Italian',
      keywords: ['pasta', 'weeknight'],
      url: 'https://example.test/lemon-pasta',
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
          name: 'Pasta',
          itemListElement: ['2 tbsp olive oil'],
        },
      ],
      recipeInstructions: [
        {
          '@type': 'HowToSection',
          name: 'Cook',
          itemListElement: [{ '@type': 'HowToStep', text: 'Toss and serve.' }],
        },
      ],
    });
    const roundTrip = createJsonLdDraft(JSON.stringify(document), 0);
    expect(roundTrip.recipe.restMinutes).toBe(5);
    expect(roundTrip.recipe.equipmentRequirements).toEqual([]);
    expect(JSON.stringify(document)).not.toContain('Maya');
    expect(JSON.stringify(document)).not.toContain('Save pasta water');
  });
});

it('round-trips portable method requirements and omits invalid private assignment metadata', () => {
  const requirements = [
    {
      capability: 'heat-electric',
      quantity: 1,
      capacityReviewRequired: true,
      alternativeCapabilities: ['heat-gas'],
      steps: [{ section: 0, step: 0 }],
    },
  ];
  const source = {
    '@context': 'https://schema.org',
    '@type': 'Recipe',
    name: 'Stovetop potatoes',
    recipeYield: '2 servings',
    cookingMethod: 'Simmer',
    prepTime: 'PT5M',
    cookTime: 'PT25M',
    tool: [{ '@type': 'HowToTool', name: 'Saucepan' }, 'Hob'],
    recipeIngredient: ['500 g potatoes'],
    recipeInstructions: ['Simmer until tender, then drain.'],
    additionalProperty: [
      {
        '@type': 'PropertyValue',
        name: 'Bòrd recipe method metadata',
        value: JSON.stringify({ restMinutes: 2, equipmentRequirements: requirements }),
      },
    ],
  };
  const draft = createJsonLdDraft(JSON.stringify(source), 0);
  expect(draft.recipe).toMatchObject({
    cookingMethod: 'Simmer',
    restMinutes: 2,
    cookMinutes: 25,
    equipment: ['Saucepan', 'Hob'],
    equipmentRequirements: requirements,
  });
  source.additionalProperty[0]!.value = JSON.stringify({
    restMinutes: 2,
    equipmentRequirements: [{ ...requirements[0], resourceIds: ['private-household-base'] }],
  });
  const invalid = createJsonLdDraft(JSON.stringify(source), 0);
  expect(invalid.recipe.equipmentRequirements ?? []).toEqual([]);
  expect(invalid.warnings).toContain(
    'Bòrd method metadata was invalid and was omitted. Review equipment requirements and rest time.',
  );
  expect(JSON.stringify(invalid.recipe)).not.toContain('private-household-base');
});
