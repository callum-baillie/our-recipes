import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { eq } from 'drizzle-orm';

import { getDatabase, resetDatabaseForTests } from '@/lib/db/client';
import {
  foodCatalogImportOperations,
  foodProviderSnapshots,
  pantryBatches,
  pantryProductIdentifiers,
  pantryProductProviderLinks,
} from '@/lib/db/schema';
import type { FoodRecord } from '@/lib/domain/food-data';
import { completeSetup } from '@/lib/services/household-service';
import { importFoodCatalogRecord } from '@/lib/services/food-catalog-import-service';
import { ensureDefaultPantryLocations, listPantryLocations } from '@/lib/services/pantry-service';
import { selectPreferredFoodNutritionRecord } from '@/lib/services/nutrition-foundation-service';

const record: FoodRecord = {
  provider: 'open_food_facts',
  providerRecordId: '4006381333931',
  canonicalGtin: '04006381333931',
  displayName: 'Provider oats',
  genericName: 'oats',
  brand: 'Test brand',
  dataType: 'product',
  quantity: '500 g',
  servingSize: '',
  servingWeightGrams: null,
  categories: ['breakfast cereals'],
  ingredientsText: 'Oats',
  ingredientTags: ['oats'],
  allergens: ['gluten'],
  traces: [],
  additives: [],
  labels: [],
  countries: ['United States'],
  language: 'en',
  nutrients: [
    {
      nutrientCode: 'energy_kcal',
      amount: 370,
      unit: 'kcal',
      basis: 'per_100g',
      originalId: 'energy-kcal',
      originalName: 'energy-kcal',
      originalUnit: 'kcal',
    },
    {
      nutrientCode: 'protein',
      amount: 12,
      unit: 'g',
      basis: 'per_100g',
      originalId: 'proteins',
      originalName: 'proteins',
      originalUnit: 'g',
    },
  ],
  nutrientBasis: 'per_100g',
  nutriScore: 'a',
  novaGroup: 1,
  images: [],
  completeness: 0.75,
  sourceUrl: 'https://world.openfoodfacts.org/product/4006381333931',
  citation: 'Open Food Facts contributors',
  license: 'ODbL 1.0',
  schemaVersion: 'off-v3.6-normalized-v1',
  retrievedAt: '2026-07-21T12:00:00.000Z',
  providerMetadata: {},
};

describe('reviewed food catalog import', () => {
  let profileId: string;
  let locationId: string;
  beforeEach(() => {
    vi.stubEnv('DATABASE_URL', ':memory:');
    vi.stubEnv('DATA_DIR', './.test-data/food-catalog');
    resetDatabaseForTests();
    profileId = completeSetup({
      householdName: 'Food data household',
      appName: 'Bòrd',
      profile: {
        displayName: 'Maya',
        color: '#637A45',
        avatarUrl: '',
        units: 'metric',
        temperatureUnit: 'C',
        locale: 'en-US',
        timezone: 'America/Los_Angeles',
      },
    }).profiles[0]!.id;
    ensureDefaultPantryLocations(profileId);
    locationId = listPantryLocations()[0]!.id;
  });
  afterEach(() => {
    resetDatabaseForTests();
    vi.unstubAllEnvs();
  });

  it('atomically creates selected provenance, sparse nutrition, and one physical batch', () => {
    const operationId = crypto.randomUUID();
    const input = {
      operationId,
      selection: {
        provider: 'open_food_facts' as const,
        recordId: record.providerRecordId,
        expectedCanonicalGtin: record.canonicalGtin,
      },
      product: {
        displayName: 'Household oats',
        brand: 'Test brand',
        variant: '',
        category: 'Breakfast',
        defaultInventoryUnit: 'g',
        defaultPackageAmount: 500,
        defaultPackageUnit: 'g',
        allergens: ['gluten'],
        dietaryTags: [],
      },
    };
    const batches = [
      {
        productId: crypto.randomUUID(),
        quantityRemaining: 500,
        originalQuantity: 500,
        unit: 'g',
        packageCount: null,
        amountPerPackage: null,
        packageUnit: '',
        approximateState: null,
        locationId,
        sublocation: '',
        purchaseDate: null,
        bestBeforeDate: '2027-01-01',
        useByDate: null,
        sellByDate: null,
        openedDate: null,
        frozenDate: null,
        thawedDate: null,
        preparedDate: null,
        expiryPrecision: 'exact' as const,
        status: 'unopened' as const,
        purchasePriceCents: null,
        source: 'Open Food Facts',
        notes: '',
        excludeFromGrocery: false,
        sourceRecipeId: '',
        sourceMealPlanEntryId: '',
        sourceShoppingListItemId: '',
      },
    ];
    const result = importFoodCatalogRecord({
      input,
      record,
      actorProfileId: profileId,
      destination: 'pantry',
      batches,
    });
    expect(result).toMatchObject({ reusedProduct: false, batchIds: [expect.any(String)] });
    expect(
      getDatabase()
        .select()
        .from(pantryProductIdentifiers)
        .where(eq(pantryProductIdentifiers.productId, result.productId))
        .get(),
    ).toMatchObject({ normalizedValue: record.canonicalGtin, verified: true });
    expect(getDatabase().select().from(foodProviderSnapshots).all()).toHaveLength(1);
    expect(getDatabase().select().from(pantryProductProviderLinks).all()).toHaveLength(1);
    expect(getDatabase().select().from(pantryBatches).all()).toHaveLength(1);
    expect(selectPreferredFoodNutritionRecord(result.productId)).toMatchObject({
      revision: 1,
      sourceRecordKey: expect.stringContaining(record.providerRecordId),
    });

    const repeated = importFoodCatalogRecord({
      input,
      record,
      actorProfileId: profileId,
      destination: 'pantry',
      batches,
    });
    expect(repeated.batchIds).toEqual(result.batchIds);
    expect(getDatabase().select().from(pantryBatches).all()).toHaveLength(1);
    expect(getDatabase().select().from(foodCatalogImportOperations).all()).toHaveLength(1);
  });
});
