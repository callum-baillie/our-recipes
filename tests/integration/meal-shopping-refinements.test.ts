import { readKitchenContext, updateKitchenContext } from '@/lib/services/kitchen-context-service';
import { beforeEach, afterEach, describe, it, expect, vi } from 'vitest';
vi.mock('server-only', () => ({}));
import { randomUUID } from 'node:crypto';
import { resetDatabaseForTests } from '@/lib/db/client';
import { completeSetup } from '@/lib/services/household-service';
import {
  addMealPlanEntry,
  getPlannedMeal,
  updateMealPlanEntry,
  createManualShoppingList,
  addShoppingListItem,
  updateShoppingListItem,
  getShoppingList,
} from '@/lib/services/planning-service';
import {
  mealPlanEntrySchema,
  mealPlanEntryUpdateSchema,
  shoppingListItemSchema,
} from '@/lib/domain/planning';

describe('individual and non-recipe meals', () => {
  let profileId: string;
  beforeEach(() => {
    vi.stubEnv('DATABASE_URL', ':memory:');
    resetDatabaseForTests();
    profileId = completeSetup({
      householdName: 'Family',
      appName: 'Bord',
      profile: {
        displayName: 'Alex',
        color: '#637A45',
        units: 'metric',
        temperatureUnit: 'C',
        locale: 'en-GB',
        timezone: 'Europe/London',
      },
    }).profiles[0]!.id;
  });
  afterEach(() => {
    resetDatabaseForTests();
    vi.unstubAllEnvs();
  });
  it('persists individual fasting and shared restaurant meals in the same slot', () => {
    const base = { plannedFor: '2026-10-20', meal: 'lunch', servings: 1, note: '' };
    const fast = addMealPlanEntry(
      mealPlanEntrySchema.parse({ ...base, kind: 'fast', profileIds: [profileId] }),
      profileId,
    );
    const restaurant = addMealPlanEntry(
      mealPlanEntrySchema.parse({
        ...base,
        kind: 'takeout',
        title: 'Cafe by the park',
        profileIds: [],
      }),
      profileId,
    );
    expect(getPlannedMeal(fast.id)?.profileIds).toBe(JSON.stringify([profileId]));
    expect(getPlannedMeal(fast.id)?.recipeTitle).toBe('Fasting');
    expect(getPlannedMeal(restaurant.id)?.title).toBe('Cafe by the park');
    expect(getPlannedMeal(restaurant.id)?.profileIds).toBe('[]');
  });
  it('rejects unknown household members and incomplete alternatives', () => {
    const input = {
      plannedFor: '2026-10-20',
      meal: 'breakfast',
      servings: 1,
      note: '',
      kind: 'fast',
      profileIds: [randomUUID()],
    };
    expect(() => addMealPlanEntry(mealPlanEntrySchema.parse(input), profileId)).toThrow(
      /household members/,
    );
    expect(mealPlanEntrySchema.safeParse({ ...input, kind: 'options', options: [] }).success).toBe(
      false,
    );
  });
  it('preserves assignments during ordinary edits', () => {
    const input = {
      plannedFor: '2026-10-20',
      meal: 'breakfast',
      servings: 1,
      note: '',
      kind: 'fast',
      profileIds: [profileId],
    };
    const meal = addMealPlanEntry(mealPlanEntrySchema.parse(input), profileId);
    updateMealPlanEntry(
      meal.id,
      mealPlanEntryUpdateSchema.parse({
        ...input,
        profileIds: undefined,
        expectedUpdatedAt: meal.updatedAt.toISOString(),
        note: 'Personal plan',
      }),
      profileId,
    );
    expect(getPlannedMeal(meal.id)?.profileIds).toBe(JSON.stringify([profileId]));
  });
  it('records a partial cart quantity without reducing recipe demand', () => {
    const list = createManualShoppingList('Groceries', profileId);
    const input = shoppingListItemSchema.parse({
      item: 'Eggs',
      quantity: 12,
      unit: 'each',
      note: '',
      checked: false,
    });
    const item = addShoppingListItem(list.id, input, profileId);
    updateShoppingListItem(
      list.id,
      item.id,
      { ...input, cartQuantity: 6, shoppingState: 'to_buy' },
      profileId,
    );
    expect(getShoppingList(list.id)?.items[0]).toMatchObject({
      quantity: 12,
      cartQuantity: 6,
      shoppingState: 'to_buy',
    });
    updateShoppingListItem(
      list.id,
      item.id,
      { ...input, cartQuantity: 0, shoppingState: 'to_buy' },
      profileId,
    );
    expect(getShoppingList(list.id)?.items[0]).toMatchObject({ quantity: 12, cartQuantity: 0 });
  });
  it('saves interview context with conflict protection and strict field validation', () => {
    const current = readKitchenContext(profileId);
    const interview = {
      taste: 'Sweet and savory',
      snacks: 'Apples',
      desserts: 'Sometimes',
      routine: 'Shared dinner',
      favorites: 'Soup',
      avoid: 'Mushrooms',
    };
    const saved = updateKitchenContext(profileId, {
      interview,
      expectedRevision: current.revision,
    });
    expect(saved.interview).toEqual(interview);
    expect(() =>
      updateKitchenContext(profileId, { interview, expectedRevision: current.revision }),
    ).toThrow(/changed/);
    expect(() =>
      updateKitchenContext(profileId, {
        interview: { ...interview, instructions: 'extra' },
        expectedRevision: saved.revision,
      }),
    ).toThrow();
  });
});
