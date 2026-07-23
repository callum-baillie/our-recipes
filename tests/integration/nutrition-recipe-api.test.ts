import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

const cookieJar = vi.hoisted(() => new Map<string, string>());
vi.mock('server-only', () => ({}));
vi.mock('next/headers', () => ({
  cookies: async () => ({
    get: (name: string) => {
      const value = cookieJar.get(name);
      return value === undefined ? undefined : { name, value };
    },
  }),
}));

import { PUT as updateRecipeRoute } from '@/app/api/v1/recipes/[recipeId]/route';
import { POST as genericIntake } from '@/app/api/v1/nutrition/profiles/[profileId]/intake/route';
import { POST as deleteIntake } from '@/app/api/v1/nutrition/profiles/[profileId]/intake/[revisionId]/delete/route';
import { POST as logManual } from '@/app/api/v1/nutrition/profiles/[profileId]/intake/manual/route';
import { POST as logProduct } from '@/app/api/v1/nutrition/profiles/[profileId]/intake/product/route';
import { POST as logRecipe } from '@/app/api/v1/nutrition/profiles/[profileId]/intake/recipe/route';
import { POST as saveRecord } from '@/app/api/v1/nutrition/products/[productId]/records/route';
import { POST as calculate } from '@/app/api/v1/nutrition/recipes/[recipeId]/calculations/route';
import { ACTIVE_PROFILE_COOKIE, createSignedProfileValue } from '@/lib/actor-context';
import { ensureDatabase, getDatabase, resetDatabaseForTests } from '@/lib/db/client';
import {
  pantryProducts,
  recipeIngredientGroups,
  recipeIngredientProductMappings,
  recipeIngredients,
  recipes,
} from '@/lib/db/schema';
import { completeSetup } from '@/lib/services/household-service';
import { resolveNutritionHouseholdContext } from '@/lib/services/nutrition-household-profile-service';

const base = 'http://localhost:3000/api/v1/nutrition';
function request(path: string, body: unknown, trusted = true) {
  return new Request(`${base}${path}`, {
    method: 'POST',
    headers: {
      'content-type': 'application/json',
      ...(trusted ? { origin: 'http://localhost:3000' } : {}),
    },
    body: JSON.stringify(body),
  });
}

describe('recipe Nutrition APIs', () => {
  let actorId: string;
  let nutritionProfileId: string;
  const productId = '22222222-2222-4222-8222-222222222222';
  const recipeId = '33333333-3333-4333-8333-333333333333';
  const groupId = '44444444-4444-4444-8444-444444444444';
  const ingredientId = '55555555-5555-4555-8555-555555555555';

  beforeEach(() => {
    vi.stubEnv('DATABASE_URL', ':memory:');
    vi.stubEnv('DATA_DIR', './.test-data/nutrition-recipe-api');
    vi.stubEnv('COOKIE_SECRET', 'test-only-cookie-secret-that-is-at-least-32-bytes');
    cookieJar.clear();
    resetDatabaseForTests();
    ensureDatabase();
    const household = completeSetup({
      householdName: 'Household',
      appName: 'Our Recipes',
      profile: {
        displayName: 'Avery',
        color: '#245b78',
        avatarUrl: '',
        units: 'metric',
        temperatureUnit: 'C',
        locale: 'en-US',
        timezone: 'America/Los_Angeles',
      },
    });
    actorId = household.profiles[0]!.id;
    const nutrition = resolveNutritionHouseholdContext({
      profileId: actorId,
      source: 'profile-cookie',
    });
    nutritionProfileId = nutrition.activeNutritionProfile.id;
    const database = getDatabase();
    const now = new Date('2026-07-19T00:00:00Z');
    database
      .insert(pantryProducts)
      .values({
        id: productId,
        normalizedName: 'lentils',
        displayName: 'Lentils',
        defaultInventoryUnit: 'g',
        createdByProfileId: actorId,
        updatedByProfileId: actorId,
        createdAt: now,
        updatedAt: now,
      })
      .run();
    database
      .insert(recipes)
      .values({
        id: recipeId,
        title: 'Lentil soup',
        summary: '',
        status: 'active',
        servings: '4',
        prepMinutes: 10,
        cookMinutes: 30,
        restMinutes: 0,
        difficulty: '',
        cuisine: '',
        category: '',
        tips: '',
        sharedNotes: '',
        sourceName: null,
        sourceUrl: null,
        originalAuthor: null,
        cookingMethod: '',
        createdByProfileId: actorId,
        lastEditedByProfileId: actorId,
        currentRevision: 1,
        createdAt: now,
        updatedAt: now,
      })
      .run();
    database
      .insert(recipeIngredientGroups)
      .values({ id: groupId, recipeId, position: 0, name: '' })
      .run();
    database
      .insert(recipeIngredients)
      .values({
        id: ingredientId,
        recipeId,
        groupId,
        position: 0,
        quantity: 200,
        unit: 'g',
        item: 'lentils',
        note: '',
      })
      .run();
    database
      .insert(recipeIngredientProductMappings)
      .values({
        recipeIngredientId: ingredientId,
        productId,
        matchType: 'manual',
        compatibleVariant: false,
        isOptional: false,
        mappedByProfileId: actorId,
        createdAt: now,
        updatedAt: now,
      })
      .run();
  });

  afterEach(() => {
    resetDatabaseForTests();
    cookieJar.clear();
    vi.unstubAllEnvs();
  });

  it('gates mutations and never accepts browser-calculated nutrients or provenance', async () => {
    const recordBody = {
      basisType: 'per_100g',
      basisAmount: 100,
      basisUnit: 'g',
      confidence: 0.9,
      completeness: 0.8,
      values: [
        { nutrientCode: 'energy_kcal', amount: 350 },
        { nutrientCode: 'protein', amount: 25 },
      ],
    };
    expect(
      (
        await saveRecord(request(`/products/${productId}/records`, recordBody, false), {
          params: Promise.resolve({ productId }),
        })
      ).status,
    ).toBe(403);
    cookieJar.set(ACTIVE_PROFILE_COOKIE, createSignedProfileValue(actorId));
    expect(
      (
        await saveRecord(request(`/products/${productId}/records`, recordBody), {
          params: Promise.resolve({ productId }),
        })
      ).status,
    ).toBe(201);

    const productInput = {
      productId,
      quantity: 50,
      unit: 'g',
      occurredAt: '2026-07-19T15:00:00-07:00',
      mealSlot: 'snack',
    };
    expect(
      (
        await logProduct(
          request(`/profiles/${nutritionProfileId}/intake/product`, {
            ...productInput,
            values: [{ nutrientCode: 'energy_kcal', amount: 1 }],
          }),
          { params: Promise.resolve({ profileId: nutritionProfileId }) },
        )
      ).status,
    ).toBe(400);
    const productResponse = await logProduct(
      request(`/profiles/${nutritionProfileId}/intake/product`, productInput),
      { params: Promise.resolve({ profileId: nutritionProfileId }) },
    );
    expect(productResponse.status).toBe(201);
    const productRevision = (await productResponse.json()).revision;
    expect(
      productRevision.values.find(
        (value: { nutrientCode: string }) => value.nutrientCode === 'energy_kcal',
      ).amount,
    ).toBe(175);

    const manualInput = {
      sourceName: 'Cafe soup',
      quantity: 1,
      unit: 'bowl',
      occurredAt: '2026-07-19T12:00:00-07:00',
      mealSlot: 'lunch',
      values: [{ nutrientCode: 'energy_kcal', amount: 320 }],
    };
    expect(
      (
        await logManual(
          request(`/profiles/${nutritionProfileId}/intake/manual`, {
            ...manualInput,
            confidence: 1,
          }),
          { params: Promise.resolve({ profileId: nutritionProfileId }) },
        )
      ).status,
    ).toBe(400);
    const manualResponse = await logManual(
      request(`/profiles/${nutritionProfileId}/intake/manual`, manualInput),
      { params: Promise.resolve({ profileId: nutritionProfileId }) },
    );
    expect(manualResponse.status).toBe(201);
    expect((await manualResponse.json()).revision.provenance).toMatchObject({
      confidence: 0.5,
      estimated: true,
    });

    const deletedProduct = await deleteIntake(
      request(`/profiles/${nutritionProfileId}/intake/${productRevision.id}/delete`, {
        reason: 'Wrong profile.',
      }),
      {
        params: Promise.resolve({
          profileId: nutritionProfileId,
          revisionId: productRevision.id,
        }),
      },
    );
    expect(deletedProduct.status).toBe(200);
    expect((await deletedProduct.json()).revision).toMatchObject({
      state: 'deleted',
      values: [],
    });

    const injectedCalculation = await calculate(
      request(`/recipes/${recipeId}/calculations`, {
        includedOptionalIngredientIds: [],
        values: [{ nutrientCode: 'energy_kcal', amount: 1 }],
      }),
      { params: Promise.resolve({ recipeId }) },
    );
    expect(injectedCalculation.status).toBe(400);
    const calculationResponse = await calculate(
      request(`/recipes/${recipeId}/calculations`, {
        includedOptionalIngredientIds: [],
        finalWeightGrams: 800,
      }),
      { params: Promise.resolve({ recipeId }) },
    );
    expect(calculationResponse.status).toBe(201);
    const calculation = (await calculationResponse.json()).calculation;
    expect(
      calculation.values.find(
        (value: { nutrientCode: string }) => value.nutrientCode === 'energy_kcal',
      ).per100g,
    ).toBe(87.5);

    const updateResponse = await updateRecipeRoute(
      request(`/recipes/${recipeId}`, {
        expectedRevision: 1,
        title: 'Lentil soup',
        summary: '',
        servings: '8',
        prepMinutes: 10,
        cookMinutes: 30,
        sourceName: '',
        sourceUrl: '',
        tags: [],
        ingredientGroups: [
          {
            name: '',
            ingredients: [{ quantity: 400, unit: 'g', item: 'lentils', note: '' }],
          },
        ],
        instructionSections: [{ title: '', steps: ['Simmer.'] }],
      }),
      { params: Promise.resolve({ recipeId }) },
    );
    expect(updateResponse.status).toBe(200);
    expect(await updateResponse.json()).toMatchObject({
      recipe: { currentRevision: 2, servings: '8' },
      nutritionMappingRestore: { restored: 1, missing: 0 },
      nutritionRecalculation: { status: 'updated', recipeRevision: 2 },
    });

    const genericBypass = await genericIntake(
      request(`/profiles/${nutritionProfileId}/intake`, {
        occurredAt: '2026-07-19T18:00:00-07:00',
        mealSlot: 'dinner',
        state: 'eaten',
        sourceType: 'recipe',
        sourceNameSnapshot: 'Lentil soup',
        recipeId,
        recipeCalculationId: calculation.id,
        servingCount: 1,
        provenance: {
          sourceIds: [calculation.source.id],
          sourceDetails: [
            {
              ...calculation.source,
              id: calculation.source.id,
              sourceRecordKey: '',
            },
          ],
          calculationVersionId: calculation.calculationVersion.id,
          sourceDigest: calculation.sourceDigest,
          basisType: 'recipe_serving',
          basisAmount: 1,
          basisUnit: 'serving',
          confidence: 1,
          completeness: 1,
          estimated: false,
        },
        values: [
          {
            nutrientCode: 'energy_kcal',
            amount: 1,
            sourceIds: [calculation.source.id],
            confidence: 1,
            completeness: 1,
            estimated: false,
          },
        ],
      }),
      { params: Promise.resolve({ profileId: nutritionProfileId }) },
    );
    expect(genericBypass.status).toBe(400);
    expect(JSON.stringify(await genericBypass.json())).toContain('server-built integration route');

    const intakePath = `/profiles/${nutritionProfileId}/intake/recipe`;
    const intakeBody = {
      recipeCalculationId: calculation.id,
      portionWeightGrams: 200,
      occurredAt: '2026-07-19T18:00:00-07:00',
      mealSlot: 'dinner',
    };
    const injectedIntake = await logRecipe(
      request(intakePath, {
        ...intakeBody,
        values: [{ nutrientCode: 'energy_kcal', amount: 1 }],
        provenance: { sourceDigest: 'browser' },
      }),
      { params: Promise.resolve({ profileId: nutritionProfileId }) },
    );
    expect(injectedIntake.status).toBe(400);
    const intakeResponse = await logRecipe(request(intakePath, intakeBody), {
      params: Promise.resolve({ profileId: nutritionProfileId }),
    });
    expect(intakeResponse.status).toBe(201);
    const revision = (await intakeResponse.json()).revision;
    expect(
      revision.values.find(
        (value: { nutrientCode: string }) => value.nutrientCode === 'energy_kcal',
      ).amount,
    ).toBe(175);
    expect(revision.provenance.sourceDigest).toBe(calculation.sourceDigest);
    expect(JSON.stringify(revision)).not.toContain('browser');
    const correctionResponse = await logRecipe(
      request(intakePath, {
        ...intakeBody,
        portionWeightGrams: 400,
        supersedesIntakeRevisionId: revision.id,
        revisionReason: 'Two servings were eaten.',
      }),
      { params: Promise.resolve({ profileId: nutritionProfileId }) },
    );
    expect(correctionResponse.status).toBe(201);
    const correction = (await correctionResponse.json()).revision;
    expect(correction).toMatchObject({ revision: 2, state: 'corrected' });
    expect(
      correction.values.find(
        (value: { nutrientCode: string }) => value.nutrientCode === 'energy_kcal',
      ).amount,
    ).toBe(350);
  });
});
