import { randomUUID } from 'node:crypto';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

vi.mock('server-only', () => ({}));

import { GET } from '@/app/api/integrations/homepage/v1/summary/route';
import { getDatabase, resetDatabaseForTests } from '@/lib/db/client';
import { recipeImages, shoppingAisles, shoppingListItems, shoppingLists } from '@/lib/db/schema';
import { completeSetup } from '@/lib/services/household-service';
import { addMealPlanEntry } from '@/lib/services/planning-service';
import { createRecipe } from '@/lib/services/recipe-service';

const endpoint = 'http://bord:3000/api/integrations/homepage/v1/summary';
const integrationToken = 'homepage-test-token-with-enough-entropy';

function setupHousehold() {
  return completeSetup({
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
}

function createDinnerRecipe(profileId: string) {
  return createRecipe(
    {
      title: 'Lemon chicken',
      summary: 'A bright family dinner.',
      servings: '4 servings',
      prepMinutes: 10,
      cookMinutes: 25,
      sourceName: '',
      sourceUrl: '',
      tags: ['dinner'],
      ingredientGroups: [
        {
          name: '',
          ingredients: [{ quantity: 2, unit: 'lb', item: 'chicken thighs', note: '' }],
        },
      ],
      instructionSections: [{ title: '', steps: ['Roast until cooked through.'] }],
    },
    profileId,
  );
}

function authorizedRequest(token = integrationToken): Request {
  return new Request(endpoint, { headers: { Authorization: `Bearer ${token}` } });
}

describe('Homepage summary integration', () => {
  beforeEach(() => {
    vi.useFakeTimers();
    vi.setSystemTime(new Date('2026-07-18T16:00:00.000Z'));
    vi.stubEnv('DATABASE_URL', ':memory:');
    vi.stubEnv('HOMEPAGE_INTEGRATION_TOKEN', integrationToken);
    resetDatabaseForTests();
  });

  afterEach(() => {
    resetDatabaseForTests();
    vi.useRealTimers();
    vi.unstubAllEnvs();
  });

  it('returns the earliest future meal and the newest list with five ordered unchecked items', async () => {
    const profile = setupHousehold();
    const recipe = createDinnerRecipe(profile.id);
    const db = getDatabase();

    // The image metadata is sufficient here: the summary publishes the existing
    // private image route and never reads or exposes its storage key.
    const imageId = randomUUID();
    db.insert(recipeImages)
      .values({
        id: imageId,
        recipeId: recipe.id,
        storageKey: `${recipe.id}/homepage-test.webp`,
        altText: 'Lemon chicken',
        width: 1200,
        height: 800,
        createdByProfileId: profile.id,
        createdAt: new Date('2026-07-18T15:00:00.000Z'),
      })
      .run();

    // Insert out of chronological order and include a meal whose slot has
    // already passed in the household timezone.
    addMealPlanEntry(
      {
        plannedFor: '2026-07-18',
        meal: 'dinner',
        recipeId: recipe.id,
        servings: 4,
        note: 'private dinner note',
      },
      profile.id,
    );
    addMealPlanEntry(
      {
        plannedFor: '2026-07-18',
        meal: 'breakfast',
        recipeId: recipe.id,
        servings: 2,
        note: '',
      },
      profile.id,
    );
    addMealPlanEntry(
      {
        plannedFor: '2026-07-18',
        meal: 'lunch',
        recipeId: recipe.id,
        servings: 4,
        note: '',
      },
      profile.id,
    );

    const oldListId = randomUUID();
    const currentListId = randomUUID();
    const meatAisleId = randomUUID();
    const produceAisleId = randomUUID();
    db.insert(shoppingAisles)
      .values([
        {
          id: meatAisleId,
          name: 'Meat',
          position: 0,
          createdAt: new Date('2026-07-18T13:00:00.000Z'),
          updatedAt: new Date('2026-07-18T13:00:00.000Z'),
        },
        {
          id: produceAisleId,
          name: 'Produce',
          position: 1,
          createdAt: new Date('2026-07-18T13:00:00.000Z'),
          updatedAt: new Date('2026-07-18T13:00:00.000Z'),
        },
      ])
      .run();
    db.insert(shoppingLists)
      .values([
        {
          id: oldListId,
          name: 'Older grocery list',
          weekStart: '2026-07-06',
          weekEnd: '2026-07-12',
          createdByProfileId: profile.id,
          createdAt: new Date('2026-07-17T14:00:00.000Z'),
          updatedAt: new Date('2026-07-17T14:00:00.000Z'),
        },
        {
          id: currentListId,
          name: 'Current grocery list',
          weekStart: '2026-07-13',
          weekEnd: '2026-07-19',
          createdByProfileId: profile.id,
          createdAt: new Date('2026-07-18T14:00:00.000Z'),
          updatedAt: new Date('2026-07-18T14:00:00.000Z'),
        },
      ])
      .run();

    const items = [
      { position: 4, item: 'Salt', quantity: null, unit: '', aisleId: null, checked: false },
      {
        position: 0,
        item: 'Chicken thighs',
        quantity: 2,
        unit: 'lb',
        aisleId: meatAisleId,
        checked: false,
      },
      { position: 7, item: 'Eggs', quantity: 12, unit: '', aisleId: null, checked: false },
      {
        position: 2,
        item: 'Apples',
        quantity: 6,
        unit: '',
        aisleId: produceAisleId,
        checked: false,
      },
      { position: 1, item: 'Milk', quantity: 1, unit: 'gal', aisleId: null, checked: true },
      { position: 6, item: 'Butter', quantity: 1, unit: 'pack', aisleId: null, checked: false },
      { position: 3, item: 'Rice', quantity: 1, unit: 'bag', aisleId: null, checked: false },
      { position: 5, item: 'Pepper', quantity: null, unit: '', aisleId: null, checked: false },
    ];
    db.insert(shoppingListItems)
      .values(
        items.map((item) => ({
          id: randomUUID(),
          listId: currentListId,
          ...item,
          note: item.item === 'Rice' ? 'private list note' : '',
          sourceRecipeIds: '[]',
          createdAt: new Date('2026-07-18T14:00:00.000Z'),
          updatedAt:
            item.position === 3
              ? new Date('2026-07-18T15:30:00.000Z')
              : new Date('2026-07-18T14:00:00.000Z'),
        })),
      )
      .run();

    const response = GET(authorizedRequest());
    expect(response.status).toBe(200);
    expect(response.headers.get('cache-control')).toBe('private, no-store');
    const body = await response.json();

    expect(body).toEqual({
      generatedAt: '2026-07-18T16:00:00.000Z',
      nextMeal: {
        date: '2026-07-18',
        slot: 'lunch',
        title: 'Lemon chicken',
        recipeUrl: `https://recipes.tower/recipes/${recipe.id}`,
        imageUrl: `https://recipes.tower/api/v1/recipes/${recipe.id}/images/${imageId}`,
        servings: 4,
        scheduledFor: '2026-07-18T12:00:00-07:00',
      },
      groceryList: {
        title: 'Current grocery list',
        updatedAt: '2026-07-18T15:30:00.000Z',
        totalItems: 8,
        remainingItems: 7,
        items: [
          { name: 'Chicken thighs', quantity: '2 lb', category: 'Meat' },
          { name: 'Apples', quantity: '6', category: 'Produce' },
          { name: 'Rice', quantity: '1 bag', category: 'Unassigned' },
          { name: 'Salt', quantity: '', category: 'Unassigned' },
          { name: 'Pepper', quantity: '', category: 'Unassigned' },
        ],
      },
    });
    expect(JSON.stringify(body)).not.toContain('private');
    expect(JSON.stringify(body)).not.toContain(profile.id);
  });

  it('returns null meal and list values for an empty household plan', async () => {
    setupHousehold();

    const response = GET(authorizedRequest());
    expect(response.status).toBe(200);
    await expect(response.json()).resolves.toEqual({
      generatedAt: '2026-07-18T16:00:00.000Z',
      nextMeal: null,
      groceryList: null,
    });
  });

  it('rejects missing and invalid bearer credentials', async () => {
    const missing = GET(new Request(endpoint));
    expect(missing.status).toBe(401);
    expect(missing.headers.get('www-authenticate')).toBe('Bearer realm="Homepage integration"');
    await expect(missing.json()).resolves.toEqual({
      error: {
        code: 'invalid_integration_credentials',
        message: 'Valid Homepage integration credentials are required.',
      },
    });

    const invalid = GET(authorizedRequest('wrong-token'));
    expect(invalid.status).toBe(401);
  });

  it('fails closed when the server integration token is not configured', () => {
    vi.stubEnv('HOMEPAGE_INTEGRATION_TOKEN', '');
    expect(GET(authorizedRequest()).status).toBe(401);
  });
});
