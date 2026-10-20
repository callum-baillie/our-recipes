import { afterEach, beforeEach, expect, it, vi } from 'vitest';
import { resetDatabaseForTests } from '@/lib/db/client';
import { shoppingListItemSchema } from '@/lib/domain/planning';
import { defaultProfileInput } from '@/lib/domain/setup';
import { completeSetup } from '@/lib/services/household-service';
import {
  addShoppingListItem,
  createManualShoppingList,
  getShoppingList,
  updateShoppingListItem,
} from '@/lib/services/planning-service';

let actor: string;
beforeEach(() => {
  vi.stubEnv('DATABASE_URL', ':memory:');
  resetDatabaseForTests();
  actor = completeSetup({
    householdName: 'Purchase units fixture',
    appName: 'Bòrd',
    profile: { ...defaultProfileInput, displayName: 'Maya' },
  }).profiles[0]!.id;
});
afterEach(() => {
  resetDatabaseForTests();
  vi.unstubAllEnvs();
});

it('never infers an unreviewed legacy cart unit from recipe demand', () => {
  const list = createManualShoppingList('Unit review', actor);
  const input = { item: 'Food', note: '', quantity: 2, unit: 'each', cartQuantity: 500 };
  const row = addShoppingListItem(list.id, shoppingListItemSchema.parse(input), actor);
  expect(row).toMatchObject({ quantity: 2, unit: 'each', cartQuantity: 500, cartUnit: null });
  updateShoppingListItem(
    list.id,
    row.id,
    shoppingListItemSchema.parse({ ...input, cartQuantity: 600 }),
    actor,
  );
  expect(getShoppingList(list.id)!.items[0]).toMatchObject({ cartQuantity: 600, cartUnit: null });
});

it('retains the reviewed purchase unit through unrelated demand edits and explicit zero', () => {
  const list = createManualShoppingList('Separate dimensions', actor);
  const input = {
    item: 'Food',
    note: '',
    quantity: 2,
    unit: 'each',
    cartQuantity: 500,
    cartUnit: 'g',
  };
  const row = addShoppingListItem(list.id, shoppingListItemSchema.parse(input), actor);
  updateShoppingListItem(
    list.id,
    row.id,
    shoppingListItemSchema.parse({
      item: 'Food',
      note: '',
      quantity: 3,
      unit: 'kg',
      cartQuantity: 0,
    }),
    actor,
  );
  expect(getShoppingList(list.id)!.items[0]).toMatchObject({
    quantity: 3,
    unit: 'kg',
    cartQuantity: 0,
    cartUnit: 'g',
  });
});
