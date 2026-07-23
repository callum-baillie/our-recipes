import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

vi.mock('server-only', () => ({}));

import { existsSync, rmSync } from 'node:fs';
import { resolve } from 'node:path';
import sharp from 'sharp';

import { resetDatabaseForTests } from '@/lib/db/client';
import {
  completeCookSession,
  isFavorite,
  setFavorite,
  startCookSession,
} from '@/lib/services/cooking-service';
import {
  addProfile,
  completeSetup,
  getHouseholdState,
  listProfiles,
  setProfileArchived,
  updateHouseholdSettings,
} from '@/lib/services/household-service';
import {
  addRecipeToCollection,
  createCollection,
  deleteCollection,
  getCollection,
  listCollectionsForRecipe,
  reorderCollections,
  replaceCollectionRecipes,
  updateCollection,
} from '@/lib/services/collection-service';
import {
  addMealPlanEntries,
  addMealPlanEntry,
  createShoppingAisle,
  duplicateWeek,
  generateShoppingList,
  getShoppingList,
  plannedMealsAsIcs,
  removeShoppingAisle,
  reorderShoppingAisles,
  swapMealPlanEntries,
  updateShoppingListItem,
} from '@/lib/services/planning-service';
import {
  createRecipe,
  createTag,
  deleteTag,
  duplicateRecipe,
  getRecipe,
  listRecipeLibrary,
  listRecipes,
  RecipeConflictError,
  recipeAsMarkdown,
  restoreRecipeRevision,
  setRecipePreference,
  setRecipeReaction,
  listTags,
  mergeTag,
  updateRecipe,
  updateRecipeTags,
  updateRecipeStatus,
  updateTag,
} from '@/lib/services/recipe-service';
import {
  createRecipeImage,
  deleteRecipeImage,
  getRecipeImageFile,
} from '@/lib/services/recipe-image-service';
import {
  appendRecipeNutritionCalculation,
  createNutritionDataSource,
  registerCalculationVersion,
} from '@/lib/services/nutrition-foundation-service';
import { getPrivateNutritionProfile } from '@/lib/services/nutrition-profile-service';

describe('household persistence', () => {
  beforeEach(() => {
    vi.stubEnv('DATABASE_URL', ':memory:');
    vi.stubEnv('DATA_DIR', './.test-data/media');
    resetDatabaseForTests();
  });

  afterEach(() => {
    resetDatabaseForTests();
    rmSync(resolve(process.cwd(), '.test-data/media'), { recursive: true, force: true });
    vi.unstubAllEnvs();
  });

  it('persists the household and initial profile together', () => {
    completeSetup({
      householdName: 'Sunday suppers',
      appName: 'Our Recipes',
      brandIcon: 'cooking-pot',
      profile: {
        displayName: 'Maya',
        color: '#637A45',
        avatarUrl: '',
        units: 'imperial',
        temperatureUnit: 'F',
        locale: 'en-US',
        timezone: 'America/Los_Angeles',
        mainGoals: 'Make weekday meals simpler and waste less food.',
        goalContext: {
          focusAreas: ['organized-meals', 'reduce-food-waste'],
          motivation: 'I want evenings to feel less rushed.',
          challenges: 'I decide what to cook too late.',
          successVision: 'Dinner is planned and the fridge gets used.',
        },
      },
      nutrition: {
        profileType: 'adult',
        dateOfBirth: '1991-04-12',
        heightCentimeters: 168,
        currentWeightKilograms: 64,
        referenceSexCategory: 'female',
        activityLevel: 'moderate',
        nutritionGoalType: 'maintain',
        dietaryPreferences: ['Vegetarian'],
        foodAllergies: ['Peanuts'],
        dietaryExclusions: ['Alcohol'],
        weightTrackingEnabled: true,
        estimatedTargetsEnabled: true,
        estimatedTargetConsent: true,
      },
    });
    const state = getHouseholdState();
    expect(state.household?.kitchenName).toBe('Sunday suppers');
    expect(state.household?.kitchenIcon).toBe('cooking-pot');
    expect(state.profiles).toHaveLength(1);
    expect(state.profiles[0]?.temperatureUnit).toBe('F');
    expect(state.profiles[0]?.mainGoals).toBe('Make weekday meals simpler and waste less food.');
    expect(state.profiles[0]?.goalContext).toEqual({
      focusAreas: ['organized-meals', 'reduce-food-waste'],
      motivation: 'I want evenings to feel less rushed.',
      challenges: 'I decide what to cook too late.',
      successVision: 'Dinner is planned and the fridge gets used.',
    });
    expect(getPrivateNutritionProfile(state.profiles[0]!.id, state.profiles[0]!.id)).toMatchObject({
      profileType: 'adult',
      dateOfBirth: '1991-04-12',
      heightCentimeters: 168,
      currentWeightKilograms: 64,
      activityLevel: 'moderate',
      nutritionGoalType: 'maintain',
      dietaryPreferences: '["Vegetarian"]',
      foodAllergies: '["Peanuts"]',
      dietaryExclusions: '["Alcohol"]',
      weightTrackingEnabled: true,
      estimatedTargetsEnabled: true,
      estimatedTargetConsent: true,
    });
    expect(
      updateHouseholdSettings({
        householdName: 'The Sunday table',
        appName: "Maya's Recipe Box",
        brandIcon: 'cooking-pot',
      }),
    ).toMatchObject({
      kitchenName: "Maya's Recipe Box",
      kitchenIcon: 'cooking-pot',
    });
    expect(getHouseholdState().household).toMatchObject({
      kitchenName: "Maya's Recipe Box",
      kitchenIcon: 'cooking-pot',
    });
  });

  it('creates an ordered multi-profile roster atomically during setup', () => {
    const state = completeSetup({
      householdName: 'Everyone cooks',
      appName: 'Everyone cooks',
      profile: {
        displayName: 'Maya',
        color: '#637A45',
        avatarUrl: '',
        units: 'imperial',
        temperatureUnit: 'F',
        locale: 'en-US',
        timezone: 'America/Los_Angeles',
      },
      additionalProfiles: [
        {
          profile: {
            displayName: 'Avery',
            color: '#466F75',
            avatarUrl: '',
            units: 'imperial',
            temperatureUnit: 'F',
            locale: 'en-US',
            timezone: 'America/Los_Angeles',
            mainGoals: 'Try one new dinner each week.',
          },
          nutrition: {
            profileType: 'dependent',
            dateOfBirth: '',
            heightCentimeters: null,
            currentWeightKilograms: null,
            referenceSexCategory: null,
            activityLevel: null,
            nutritionGoalType: 'none',
            dietaryPreferences: [],
            foodAllergies: ['Peanuts'],
            dietaryExclusions: [],
            weightTrackingEnabled: false,
            estimatedTargetsEnabled: false,
            estimatedTargetConsent: false,
          },
        },
      ],
    });

    expect(state.profiles.map((profile) => profile.displayName)).toEqual(['Maya', 'Avery']);
    expect(getPrivateNutritionProfile(state.profiles[1]!.id, state.profiles[1]!.id)).toMatchObject({
      profileType: 'dependent',
      foodAllergies: '["Peanuts"]',
    });
  });

  it('filters and sorts current normalized nutrition before pagination', () => {
    const profile = completeSetup({
      householdName: 'Nutrition recipe table',
      appName: 'Our Recipes',
      profile: {
        displayName: 'Maya',
        color: '#637A45',
        avatarUrl: '',
        units: 'metric',
        temperatureUnit: 'C',
        locale: 'en-US',
        timezone: 'America/Los_Angeles',
      },
    }).profiles[0]!;
    const recipeInput = (title: string) => ({
      title,
      summary: '',
      servings: '4 servings',
      prepMinutes: 10,
      cookMinutes: 20,
      sourceName: '',
      sourceUrl: '',
      tags: [],
      ingredientGroups: [
        { name: '', ingredients: [{ quantity: 1, unit: 'g', item: 'test food', note: '' }] },
      ],
      instructionSections: [{ title: '', steps: ['Cook.'] }],
    });
    const highProtein = createRecipe(recipeInput('High protein soup'), profile.id);
    const lowerSodium = createRecipe(recipeInput('Lower sodium soup'), profile.id);
    const source = createNutritionDataSource({
      sourceType: 'calculated',
      name: 'Recipe library test calculator',
      provider: 'Our Recipes',
      version: '1',
      citation: 'Deterministic integration fixture',
    });
    const version = registerCalculationVersion({
      algorithm: 'ingredient-sum',
      version: '1',
      energyFactorsVersion: 'general-4-4-9-7-v1',
      implementationDigest: 'recipe-library-nutrition-v1',
    });
    let highProteinCalculationId = '';
    for (const [recipe, values, completeness] of [
      [
        highProtein,
        [
          ['energy_kcal', 400],
          ['protein', 40],
          ['fiber', 20],
          ['sodium', 800],
        ],
        0.9,
      ],
      [
        lowerSodium,
        [
          ['energy_kcal', 800],
          ['protein', 20],
          ['fiber', 4],
          ['sodium', 400],
        ],
        0.6,
      ],
    ] as const) {
      const calculation = appendRecipeNutritionCalculation({
        recipeId: recipe.id,
        recipeRevision: recipe.currentRevision,
        calculationVersionId: version.id,
        sourceId: source.id,
        sourceDigest: `library-${recipe.id}`,
        servingCount: 4,
        confidence: 0.9,
        completeness,
        values: values.map(([nutrientCode, amount]) => ({
          nutrientCode,
          amount,
          confidence: 0.9,
          completeness,
        })),
      });
      if (recipe.id === highProtein.id) highProteinCalculationId = calculation.id;
    }

    const filtered = listRecipeLibrary(
      {
        q: '',
        status: 'active',
        sort: 'highest-protein',
        minProteinPerServing: 8,
        minNutritionCompleteness: 80,
        page: 1,
      },
      profile.id,
      1,
    );
    expect(filtered).toMatchObject({ total: 1, totalPages: 1, pageSize: 1 });
    expect(filtered.recipes.map((recipe) => recipe.id)).toEqual([highProtein.id]);

    const sorted = listRecipeLibrary(
      { q: '', status: 'active', sort: 'lowest-sodium', page: 1 },
      profile.id,
      1,
    );
    expect(sorted).toMatchObject({ total: 2, totalPages: 2 });
    expect(sorted.recipes[0]!.id).toBe(lowerSodium.id);

    appendRecipeNutritionCalculation({
      recipeId: highProtein.id,
      recipeRevision: highProtein.currentRevision,
      calculationVersionId: version.id,
      sourceId: source.id,
      sourceDigest: `library-latest-${highProtein.id}`,
      servingCount: 4,
      confidence: 0.9,
      completeness: 0.9,
      supersedesCalculationId: highProteinCalculationId,
      values: [
        {
          nutrientCode: 'energy_kcal',
          amount: 400,
          confidence: 0.9,
          completeness: 0.9,
        },
      ],
    });
    expect(
      listRecipeLibrary(
        {
          q: '',
          status: 'active',
          sort: 'highest-protein',
          minProteinPerServing: 8,
          page: 1,
        },
        profile.id,
      ).total,
    ).toBe(0);
  });

  it('keeps a structured recipe searchable and records an edit revision', () => {
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
    }).profiles[0];
    const recipe = createRecipe(
      {
        title: 'Tomato soup',
        summary: 'A quick weeknight pot.',
        servings: '4 bowls',
        prepMinutes: 10,
        cookMinutes: 25,
        sourceName: '',
        sourceUrl: '',
        tags: ['Weeknight'],
        ingredientGroups: [
          {
            name: 'For the soup',
            ingredients: [
              { quantity: 2, unit: 'tbsp', item: 'olive oil', note: '' },
              { quantity: '', unit: '', item: 'tomatoes', note: 'crushed' },
            ],
          },
        ],
        instructionSections: [{ title: 'Cook', steps: ['Warm the oil and simmer the tomatoes.'] }],
      },
      profile.id,
    );
    expect(listRecipes('tomato')).toHaveLength(1);
    const updated = updateRecipe(
      recipe.id,
      {
        title: 'Tomato soup',
        summary: 'A quick weeknight pot.',
        servings: '4 bowls',
        prepMinutes: 10,
        cookMinutes: 30,
        sourceName: '',
        sourceUrl: '',
        tags: ['Weeknight'],
        ingredientGroups: [
          {
            name: 'For the soup',
            ingredients: [
              { quantity: 2, unit: 'tbsp', item: 'olive oil', note: '' },
              { quantity: '', unit: '', item: 'tomatoes', note: 'crushed' },
            ],
          },
        ],
        instructionSections: [{ title: 'Cook', steps: ['Warm the oil and simmer the tomatoes.'] }],
      },
      profile.id,
      recipe.currentRevision,
    );
    expect(updated.currentRevision).toBe(2);
    const retagged = updateRecipeTags(
      recipe.id,
      ['Family', 'weeknight', 'family'],
      profile.id,
      updated.currentRevision,
    );
    expect(retagged.currentRevision).toBe(3);
    expect(retagged.tags).toEqual(['family', 'weeknight']);
    expect(getRecipe(recipe.id)?.revisions).toHaveLength(3);
    expect(() =>
      updateRecipeTags(recipe.id, ['stale'], profile.id, updated.currentRevision),
    ).toThrow(RecipeConflictError);
  });

  it('filters lifecycle-aware recipe cards and rejects a stale concurrent revision', () => {
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
        title: 'Layered lasagna',
        summary: '',
        servings: '6 servings',
        prepMinutes: 20,
        cookMinutes: 45,
        restMinutes: 10,
        category: 'Dinner, Main dish',
        cuisine: 'Italian, Mediterranean',
        difficulty: 'involved',
        tips: 'Rest before serving.',
        sharedNotes: 'Freeze half for later.',
        sourceName: '',
        sourceUrl: '',
        tags: ['Family', 'Freezer'],
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
      },
      profile.id,
    );
    const active = listRecipeLibrary(
      { q: '', tag: 'family', status: 'active', sort: 'shortest-time', page: 1 },
      profile.id,
    );
    expect(active.recipes).toHaveLength(1);
    expect(active.recipes[0]).toMatchObject({
      category: 'Dinner, Main dish',
      createdByName: 'Maya',
    });
    expect(
      listRecipeLibrary(
        {
          q: '',
          category: 'main dish',
          cuisine: 'mediterranean',
          status: 'active',
          sort: 'recently-updated',
          page: 1,
        },
        profile.id,
      ).recipes,
    ).toHaveLength(1);
    expect(getRecipe(recipe.id)?.ingredientGroups).toHaveLength(2);

    const archived = updateRecipeStatus(recipe.id, 'archived', profile.id, recipe.currentRevision);
    expect(listRecipes()).toHaveLength(0);
    expect(
      listRecipeLibrary(
        { q: '', status: 'archived', sort: 'recently-updated', page: 1 },
        profile.id,
      ).recipes,
    ).toHaveLength(1);
    expect(duplicateRecipe(recipe.id, profile.id).title).toBe('Copy of Layered lasagna');
    expect(() =>
      updateRecipe(
        recipe.id,
        {
          title: 'Still lasagna',
          summary: '',
          servings: '6 servings',
          prepMinutes: 20,
          cookMinutes: 45,
          sourceName: '',
          sourceUrl: '',
          tags: [],
          ingredientGroups: [
            { name: '', ingredients: [{ quantity: 1, unit: '', item: 'pasta', note: '' }] },
          ],
          instructionSections: [{ title: '', steps: ['Bake.'] }],
        },
        profile.id,
        recipe.currentRevision,
      ),
    ).toThrow(RecipeConflictError);
    expect(archived.currentRevision).toBe(2);
  });

  it('keeps recipe links while household tags and profiles are managed', () => {
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
        title: 'Freezer tomato sauce',
        summary: '',
        servings: '4 jars',
        prepMinutes: 10,
        cookMinutes: 30,
        sourceName: '',
        sourceUrl: '',
        tags: ['freezer', 'family'],
        ingredientGroups: [
          { name: '', ingredients: [{ quantity: 1, unit: 'kg', item: 'tomatoes', note: '' }] },
        ],
        instructionSections: [{ title: '', steps: ['Simmer.'] }],
      },
      profile.id,
    );
    expect(listTags().map((tag) => tag.name)).toEqual(['family', 'freezer']);
    updateTag('freezer', { name: 'batch-cooking', color: '#A85032' });
    expect(getRecipe(recipe.id)?.tags).toContain('batch-cooking');
    mergeTag('family', { name: 'batch-cooking', color: '#A85032' });
    expect(getRecipe(recipe.id)?.tags).toEqual(['batch-cooking']);
    createTag({ name: 'weeknight', color: '' });
    deleteTag('weeknight');
    expect(listTags().map((tag) => tag.name)).toEqual(['batch-cooking']);

    const second = addProfile({
      displayName: 'Jon',
      color: '#A85032',
      avatarUrl: '',
      units: 'metric',
      temperatureUnit: 'C',
      locale: 'en-GB',
      timezone: 'Europe/London',
    });
    setProfileArchived(second.id, true);
    expect(listProfiles()).toHaveLength(1);
    expect(
      listProfiles(true).find((candidate) => candidate.id === second.id)?.archivedAt,
    ).toBeInstanceOf(Date);
    expect(() => setProfileArchived(profile.id, true)).toThrow(
      'Keep at least one active household profile.',
    );
  });

  it('keeps curated collections ordered without changing their recipes', async () => {
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
    const first = createRecipe(
      {
        title: 'Sunday roast',
        summary: 'A patient family dinner.',
        servings: '6 servings',
        prepMinutes: 20,
        cookMinutes: 90,
        sourceName: '',
        sourceUrl: '',
        tags: ['family'],
        ingredientGroups: [
          { name: '', ingredients: [{ quantity: 1, unit: '', item: 'roast', note: '' }] },
        ],
        instructionSections: [{ title: '', steps: ['Cook slowly.'] }],
      },
      profile.id,
    );
    const second = createRecipe(
      {
        title: 'Monday soup',
        summary: '',
        servings: '4 bowls',
        prepMinutes: 10,
        cookMinutes: 30,
        sourceName: '',
        sourceUrl: '',
        tags: [],
        ingredientGroups: [
          { name: '', ingredients: [{ quantity: 1, unit: 'tin', item: 'tomatoes', note: '' }] },
        ],
        instructionSections: [{ title: '', steps: ['Simmer.'] }],
      },
      profile.id,
    );
    const collection = createCollection(
      { name: 'Sunday suppers', description: 'Family recipes worth repeating.', coverImageId: '' },
      profile.id,
    );
    replaceCollectionRecipes(collection.id, [second.id, first.id], profile.id);
    const source = await sharp({
      create: { width: 32, height: 24, channels: 3, background: '#9f482f' },
    })
      .png()
      .toBuffer();
    const image = await createRecipeImage(
      first.id,
      profile.id,
      source,
      'Sunday roast on a platter',
    );
    updateCollection(
      collection.id,
      {
        name: 'Sunday suppers',
        description: 'Family recipes worth repeating.',
        coverImageId: image.id,
      },
      profile.id,
    );
    const detail = getCollection(collection.id)!;
    expect(detail.recipes.map((recipe) => recipe.id)).toEqual([second.id, first.id]);
    expect(detail.coverImage?.id).toBe(image.id);
    expect(listCollectionsForRecipe(first.id).map((candidate) => candidate.id)).toEqual([
      collection.id,
    ]);
    expect(
      listRecipeLibrary(
        { q: '', collection: collection.id, status: 'active', sort: 'alphabetical', page: 1 },
        profile.id,
      ).total,
    ).toBe(2);

    replaceCollectionRecipes(collection.id, [second.id], profile.id);
    expect(getCollection(collection.id)?.coverImage).toBeNull();
    const secondCollection = createCollection(
      { name: 'Quick weekday meals', description: '', coverImageId: '' },
      profile.id,
    );
    expect(addRecipeToCollection(secondCollection.id, first.id, profile.id).added).toBe(true);
    expect(addRecipeToCollection(secondCollection.id, first.id, profile.id).added).toBe(false);
    expect(getCollection(secondCollection.id)?.recipes.map((recipe) => recipe.id)).toEqual([
      first.id,
    ]);
    expect(
      reorderCollections([secondCollection.id, collection.id], profile.id).map(
        (candidate) => candidate.id,
      ),
    ).toEqual([secondCollection.id, collection.id]);
    deleteCollection(collection.id);
    expect(getCollection(collection.id)).toBeNull();
    expect(getRecipe(first.id)?.title).toBe('Sunday roast');
  });

  it('turns planned recipe ingredients into a separately editable shopping list', () => {
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
        title: 'Pasta night',
        summary: '',
        servings: '2 servings',
        prepMinutes: 10,
        cookMinutes: 15,
        sourceName: '',
        sourceUrl: '',
        tags: [],
        ingredientGroups: [
          { name: '', ingredients: [{ quantity: 200, unit: 'g', item: 'pasta', note: '' }] },
        ],
        instructionSections: [{ title: '', steps: ['Boil the pasta.'] }],
      },
      profile.id,
    );
    addMealPlanEntry(
      { plannedFor: '2026-07-13', meal: 'dinner', recipeId: recipe.id, servings: 4, note: '' },
      profile.id,
    );
    const list = generateShoppingList('2026-07-13', '2026-07-19', profile.id);
    expect(list.items[0]?.quantity).toBe(400);
    const firstItem = list.items[0]!;
    updateShoppingListItem(list.id, firstItem.id, {
      quantity: 400,
      unit: 'g',
      item: 'pasta',
      note: 'whole wheat',
      checked: true,
    });
    expect(generateShoppingList('2026-07-13', '2026-07-19', profile.id).id).not.toBe(list.id);
    const freeform = addMealPlanEntry(
      {
        plannedFor: '2026-07-14',
        meal: 'snack',
        recipeId: '',
        title: 'Leftovers board',
        servings: 2,
        note: 'Use what is open.',
      },
      profile.id,
    );
    expect(freeform).toMatchObject({ recipeId: null, recipeTitle: 'Leftovers board' });
    const [dessert] = addMealPlanEntries(
      {
        entries: [
          {
            plannedFor: '2026-07-15',
            meal: 'dessert',
            recipeId: recipe.id,
            title: '',
            servings: 3,
            note: 'For Maya, Jon, Julia',
          },
        ],
      },
      profile.id,
    );
    expect(dessert).toMatchObject({ meal: 'dessert', servings: 3, recipeTitle: 'Pasta night' });
    expect(plannedMealsAsIcs('2026-07-13', '2026-07-19')).toContain(
      'SUMMARY:snack: Leftovers board',
    );
    expect(
      duplicateWeek(
        { weekStart: '2026-07-13', destinationWeekStart: '2026-07-20' },
        profile.id,
      ).map((meal) => meal.recipeTitle),
    ).toContain('Leftovers board');
    const [swappedFreeform, swappedDessert] = swapMealPlanEntries(
      {
        sourceId: freeform.id,
        targetId: dessert.id,
        sourceExpectedUpdatedAt: freeform.updatedAt.toISOString(),
        targetExpectedUpdatedAt: dessert.updatedAt.toISOString(),
      },
      profile.id,
    );
    expect(swappedFreeform).toMatchObject({ plannedFor: '2026-07-15', meal: 'dessert' });
    expect(swappedDessert).toMatchObject({ plannedFor: '2026-07-14', meal: 'snack' });
    const produce = createShoppingAisle({ name: 'Produce' });
    const pantry = createShoppingAisle({ name: 'Pantry' });
    reorderShoppingAisles([pantry.id, produce.id]);
    updateShoppingListItem(list.id, firstItem.id, {
      quantity: 400,
      unit: 'g',
      item: 'pasta',
      note: 'whole wheat',
      aisleId: pantry.id,
      checked: true,
    });
    expect(getShoppingList(list.id)?.items[0]?.aisleId).toBe(pantry.id);
    removeShoppingAisle(pantry.id);
    expect(getShoppingList(list.id)?.items[0]?.aisleId).toBeNull();
  });

  it('keeps rich card details revisioned while ratings and notes stay personal', () => {
    const maya = completeSetup({
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
    const jon = addProfile({
      displayName: 'Jon',
      color: '#A85032',
      avatarUrl: '',
      units: 'metric',
      temperatureUnit: 'C',
      locale: 'en-GB',
      timezone: 'Europe/London',
    });
    const input = {
      title: 'Roasted tomato soup',
      summary: 'A velvety winter bowl.',
      servings: '4 bowls',
      prepMinutes: 15,
      cookMinutes: 35,
      restMinutes: 5,
      sourceName: 'Family notebook',
      sourceUrl: 'https://example.test/roasted-tomato-soup',
      originalAuthor: 'Maya',
      cookingMethod: 'oven-roasted',
      equipment: ['Sheet pan', 'Immersion blender'],
      nutritionCalories: 230,
      nutritionProteinGrams: 5,
      nutritionCarbohydrateGrams: 22,
      nutritionFatGrams: 14,
      nutritionSaturatedFatGrams: 3,
      nutritionFiberGrams: 6,
      nutritionSugarGrams: 9,
      nutritionSodiumMilligrams: 410,
      tags: ['winter'],
      ingredientGroups: [
        { name: '', ingredients: [{ quantity: 1, unit: 'kg', item: 'tomatoes', note: '' }] },
      ],
      instructionSections: [{ title: '', steps: ['Roast the tomatoes and blend until smooth.'] }],
    };
    const created = createRecipe(input, maya.id);
    expect(created.equipment.map((item) => item.name)).toEqual(['Sheet pan', 'Immersion blender']);
    expect(created.nutritionCalories).toBe(230);
    expect(created).toMatchObject({
      nutritionSaturatedFatGrams: 3,
      nutritionSugarGrams: 9,
      nutritionSodiumMilligrams: 410,
    });
    const revised = updateRecipe(
      created.id,
      { ...input, cookingMethod: 'roast then blend' },
      maya.id,
      created.currentRevision,
    );
    expect(revised).toMatchObject({ currentRevision: 2, cookingMethod: 'roast then blend' });
    expect(revised.revisions).toHaveLength(2);
    const editedByJon = updateRecipe(
      created.id,
      { ...input, cookingMethod: 'stovetop finish' },
      jon.id,
      revised.currentRevision,
    );
    expect(editedByJon).toMatchObject({ lastEditedByName: 'Jon', currentRevision: 3 });
    expect(editedByJon.revisions[0]).toMatchObject({ editedByName: 'Jon', revision: 3 });

    expect(
      setRecipePreference(created.id, maya.id, { rating: 5, note: 'Use ripe tomatoes.' }),
    ).toMatchObject({ rating: 5, note: 'Use ripe tomatoes.' });
    expect(getRecipe(created.id, maya.id)?.personalPreference).toMatchObject({
      rating: 5,
      note: 'Use ripe tomatoes.',
    });
    expect(getRecipe(created.id, jon.id)?.personalPreference).toMatchObject({
      rating: null,
      note: '',
    });
    expect(getRecipe(created.id)?.personalPreference).toBeNull();
    expect(setRecipeReaction(created.id, maya.id, 1)).toMatchObject({
      rating: 1,
      note: 'Use ripe tomatoes.',
    });
    expect(isFavorite(created.id, maya.id)).toBe(false);
    expect(setRecipeReaction(created.id, maya.id, 5)).toMatchObject({
      rating: 5,
      note: 'Use ripe tomatoes.',
    });
    expect(isFavorite(created.id, maya.id)).toBe(true);
    const lowerRated = createRecipe(
      { ...input, title: 'Weeknight tomato soup', cookingMethod: 'quick stovetop' },
      maya.id,
    );
    setRecipePreference(lowerRated.id, maya.id, { rating: 3, note: '' });
    const ratedLibrary = listRecipeLibrary(
      { q: 'tomato soup', status: 'active', sort: 'highest-rated', page: 1 },
      maya.id,
    );
    expect(ratedLibrary.recipes.slice(0, 2)).toMatchObject([
      { id: created.id, personalRating: 5 },
      { id: lowerRated.id, personalRating: 3 },
    ]);

    const restored = restoreRecipeRevision(created.id, 1, maya.id, editedByJon.currentRevision);
    expect(restored).toMatchObject({
      currentRevision: 4,
      cookingMethod: 'oven-roasted',
      lastEditedByName: 'Maya',
    });
    expect(restored.revisions).toHaveLength(4);
    expect(() =>
      restoreRecipeRevision(created.id, 1, maya.id, editedByJon.currentRevision),
    ).toThrow(RecipeConflictError);
    expect(getRecipe(created.id, maya.id)?.personalPreference).toMatchObject({
      rating: 5,
      note: 'Use ripe tomatoes.',
    });

    const markdown = recipeAsMarkdown(getRecipe(created.id, maya.id)!);
    expect(markdown).toContain('# Roasted tomato soup');
    expect(markdown).toContain('## Equipment');
    expect(markdown).toContain('## Nutrition (per serving)');
    expect(markdown).toContain('https://example.test/roasted-tomato-soup');
    expect(markdown).not.toContain('Use ripe tomatoes.');
    expect(setRecipePreference(created.id, maya.id, { rating: null, note: '' })).toMatchObject({
      rating: null,
      note: '',
    });
    expect(getRecipe(created.id, maya.id)?.personalPreference).toMatchObject({
      rating: null,
      note: '',
    });
  });

  it('keeps favorites and completed cook sessions personal to a profile', () => {
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
        title: 'Toast',
        summary: '',
        servings: '1 serving',
        prepMinutes: 1,
        cookMinutes: 2,
        sourceName: '',
        sourceUrl: '',
        tags: [],
        ingredientGroups: [
          { name: '', ingredients: [{ quantity: 2, unit: 'slice', item: 'bread', note: '' }] },
        ],
        instructionSections: [{ title: '', steps: ['Toast bread.'] }],
      },
      profile.id,
    );
    setFavorite(recipe.id, profile.id, true);
    expect(isFavorite(recipe.id, profile.id)).toBe(true);
    expect(getRecipe(recipe.id, profile.id)?.personalPreference?.rating).toBe(3);
    expect(setRecipeReaction(recipe.id, profile.id, 5)).toMatchObject({ rating: 5, note: '' });
    expect(isFavorite(recipe.id, profile.id)).toBe(true);
    expect(setRecipeReaction(recipe.id, profile.id, 1)).toMatchObject({ rating: 1, note: '' });
    expect(isFavorite(recipe.id, profile.id)).toBe(false);
    expect(setRecipeReaction(recipe.id, profile.id, null)).toMatchObject({
      rating: null,
      note: '',
    });
    const session = startCookSession(recipe.id, profile.id, 2);
    completeCookSession(session.id, profile.id);
  });

  it('persists a normalized local recipe image and removes its durable file', async () => {
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
        title: 'Garden toast',
        summary: '',
        servings: '1 serving',
        prepMinutes: 5,
        cookMinutes: 2,
        sourceName: '',
        sourceUrl: '',
        tags: [],
        ingredientGroups: [
          { name: '', ingredients: [{ quantity: 2, unit: 'slice', item: 'bread', note: '' }] },
        ],
        instructionSections: [{ title: '', steps: ['Toast the bread.'] }],
      },
      profile.id,
    );
    const source = await sharp({
      create: { width: 32, height: 24, channels: 3, background: '#9f482f' },
    })
      .png()
      .toBuffer();
    const image = await createRecipeImage(recipe.id, profile.id, source, 'A garden toast');
    expect(getRecipe(recipe.id)?.images).toHaveLength(1);
    expect(existsSync(resolve(process.cwd(), '.test-data/media/uploads', image.storageKey))).toBe(
      true,
    );
    const stored = await getRecipeImageFile(recipe.id, image.id);
    expect((await sharp(stored.data).metadata()).format).toBe('webp');

    await deleteRecipeImage(recipe.id, image.id);
    expect(getRecipe(recipe.id)?.images).toHaveLength(0);
    expect(existsSync(resolve(process.cwd(), '.test-data/media/uploads', image.storageKey))).toBe(
      false,
    );
  });
});
