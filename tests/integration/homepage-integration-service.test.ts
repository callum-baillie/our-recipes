import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

import { resetDatabaseForTests } from '@/lib/db/client';
import { completeSetup } from '@/lib/services/household-service';
import {
  getHomepageIntegrationSummary,
  hasValidHomepageIntegrationAuthorization,
} from '@/lib/services/homepage-integration-service';
import { addMealPlanEntry, generateShoppingList } from '@/lib/services/planning-service';
import { createRecipe } from '@/lib/services/recipe-service';

const integrationToken = 'homepage-integration-token-that-is-long-enough';

describe('Homepage integration summary', () => {
  beforeEach(() => {
    vi.stubEnv('DATABASE_URL', ':memory:');
    vi.stubEnv('DATA_DIR', './.test-data/homepage-integration');
    vi.stubEnv('APP_ORIGIN', 'https://recipes.tower');
    vi.stubEnv('HOMEPAGE_INTEGRATION_TOKEN', integrationToken);
    resetDatabaseForTests();
  });

  afterEach(() => {
    resetDatabaseForTests();
    vi.unstubAllEnvs();
  });

  it('uses constant-time bearer-token validation semantics', () => {
    expect(hasValidHomepageIntegrationAuthorization(`Bearer ${integrationToken}`)).toBe(true);
    expect(hasValidHomepageIntegrationAuthorization('Bearer incorrect-token')).toBe(false);
    expect(hasValidHomepageIntegrationAuthorization(null)).toBe(false);
  });

  it('returns the next scheduled meal and active grocery summary', () => {
    const profile = completeSetup({
      householdName: 'Tower household',
      appName: 'Our Recipes',
      profile: {
        displayName: 'Callum',
        color: '#425B76',
        avatarUrl: '',
        units: 'imperial',
        temperatureUnit: 'F',
        locale: 'en-US',
        timezone: 'America/Chicago',
      },
    }).profiles[0]!;
    const recipe = createRecipe(
      {
        title: 'Weeknight pasta',
        summary: '',
        servings: '4 servings',
        prepMinutes: 10,
        cookMinutes: 20,
        sourceName: '',
        sourceUrl: '',
        tags: [],
        ingredientGroups: [
          {
            name: '',
            ingredients: [
              { quantity: 1, unit: 'lb', item: 'pasta', note: '' },
              { quantity: 1, unit: 'jar', item: 'sauce', note: 'marinara' },
            ],
          },
        ],
        instructionSections: [{ title: '', steps: ['Cook and serve.'] }],
      },
      profile.id,
    );
    addMealPlanEntry(
      {
        plannedFor: '2026-07-18',
        meal: 'dinner',
        recipeId: recipe.id,
        servings: 4,
        note: '',
      },
      profile.id,
    );
    const list = generateShoppingList('2026-07-13', '2026-07-19', profile.id);

    const summary = getHomepageIntegrationSummary(new Date('2026-07-18T20:00:00.000Z'));

    expect(summary.nextMeal).toMatchObject({
      date: '2026-07-18',
      slot: 'dinner',
      title: 'Weeknight pasta',
      recipeUrl: `https://recipes.tower/recipes/${recipe.id}`,
      scheduledFor: '2026-07-18T18:30:00-05:00',
    });
    expect(summary.groceryList).toMatchObject({
      title: list.name,
      totalItems: 2,
      remainingItems: 2,
      items: [
        { name: 'pasta', quantity: '1 lb', category: 'Uncategorized' },
        { name: 'sauce (marinara)', quantity: '1 jar', category: 'Uncategorized' },
      ],
    });
  });
});
