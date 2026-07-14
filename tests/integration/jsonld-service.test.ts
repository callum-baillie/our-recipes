import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

import { resetDatabaseForTests } from '@/lib/db/client';
import { completeSetup } from '@/lib/services/household-service';
import { exportRecipeAsJsonLd } from '@/lib/services/jsonld-service';
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
      prepTime: 'PT10M',
      cookTime: 'PT15M',
      totalTime: 'PT30M',
      recipeCategory: 'Dinner',
      recipeCuisine: 'Italian',
      keywords: ['pasta', 'weeknight'],
      url: 'https://example.test/lemon-pasta',
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
    expect(JSON.stringify(document)).not.toContain('Maya');
    expect(JSON.stringify(document)).not.toContain('Save pasta water');
  });
});
