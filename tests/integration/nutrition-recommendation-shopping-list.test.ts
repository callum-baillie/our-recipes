import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

import { resetDatabaseForTests } from '@/lib/db/client';
import { pantryProductInputSchema } from '@/lib/domain/pantry';
import { completeSetup } from '@/lib/services/household-service';
import { createPantryProduct } from '@/lib/services/pantry-service';
import {
  addShoppingListItem,
  createManualShoppingList,
  getShoppingList,
} from '@/lib/services/planning-service';

describe('Nutrition recommendation shopping-list integration', () => {
  beforeEach(() => {
    vi.stubEnv('DATABASE_URL', ':memory:');
    resetDatabaseForTests();
  });

  afterEach(() => {
    resetDatabaseForTests();
    vi.unstubAllEnvs();
  });

  it('preserves product/provenance identity and idempotently reuses a repeated shortage', () => {
    const profile = completeSetup({
      householdName: 'Recommendation table',
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
    const product = createPantryProduct(
      pantryProductInputSchema.parse({
        displayName: 'Red lentils',
        defaultInventoryUnit: 'g',
        defaultStorageType: 'pantry',
      }),
      profile.id,
    );
    const list = createManualShoppingList('Nutrition shortages', profile.id);
    const input = {
      quantity: 100,
      unit: 'g',
      item: 'Red lentils',
      note: 'Nutrition recommendation',
      checked: false,
      productId: product.id,
      recommendationKey: 'protein-gap-red-lentils',
    } as const;
    const first = addShoppingListItem(list.id, input, profile.id);
    const second = addShoppingListItem(list.id, input, profile.id);
    const saved = getShoppingList(list.id)!;

    expect(second.id).toBe(first.id);
    expect(saved.items).toHaveLength(1);
    expect(saved.items[0]).toMatchObject({
      id: first.id,
      quantity: 100,
      unit: 'g',
      pantry: {
        productId: product.id,
        demandState: 'manual',
        generatedQuantity: 100,
        generatedUnit: 'g',
      },
    });
    expect(JSON.parse(saved.items[0]!.pantry!.provenance)).toMatchObject({
      source: 'nutrition_recommendation',
      recommendationKey: 'protein-gap-red-lentils',
      productId: product.id,
      actorProfileId: profile.id,
    });
  });
});
