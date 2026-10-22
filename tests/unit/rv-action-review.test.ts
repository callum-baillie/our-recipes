import { describe, expect, it } from 'vitest';
import { buildAppActionReview } from '@/lib/domain/ai-app-action-review';
import { actionReviewLines } from '../../shared/mobile-domain/app-action-review';
const base = {
  operationId: 'updateShoppingListItem',
  path: '/shopping-lists/{listId}/items/{itemId}',
  method: 'PATCH',
  parameters: { listId: 'list-secret-id', itemId: 'item-secret-id' },
};
describe('shared bounded action review presentation', () => {
  it('identifies the item and parent list, preserves unknown/zero, and shows amount before/after', () => {
    const review = buildAppActionReview({
      ...base,
      snapshot: {
        list: {
          name: 'Weekend groceries',
          items: [
            { id: 'item-secret-id', item: 'Oat drink', quantity: null, unit: 'ml', checked: false },
          ],
        },
      },
      body: { quantity: 0, unit: 'ml', expectedVersion: 4 },
    });
    expect(review.subject.label).toBe('Oat drink');
    expect(review.context).toContainEqual({ label: 'List', value: 'Weekend groceries' });
    expect(review.context).toContainEqual({ label: 'Amount to buy', value: 'Not recorded ml' });
    expect(actionReviewLines(review)).toContainEqual({
      label: 'Quantity',
      value: 'Not recorded → 0',
    });
    expect(
      JSON.stringify({ ...review, subject: { ...review.subject, href: undefined } }),
    ).not.toMatch(/secret-id|expectedVersion/);
  });
  it('uses the batch product/location and exact known quantity rather than an identifier', () => {
    const review = buildAppActionReview({
      operationId: 'updatePantryBatch',
      path: '/pantry/batches/{batchId}',
      method: 'PATCH',
      parameters: { batchId: 'batch-id' },
      snapshot: {
        batch: {
          product: { displayName: 'Green lentils' },
          location: { path: 'Kitchen / Cupboard' },
          quantityRemaining: 500,
          quantityLabel: 'About 500 g',
          unit: 'g',
        },
      },
      body: { quantityRemaining: 250 },
    });
    expect(review.subject.label).toBe('Green lentils');
    expect(review.context).toContainEqual({ label: 'Amount', value: 'About 500 g' });
    expect(review.context).toContainEqual({ label: 'Location', value: 'Kitchen / Cupboard' });
    expect(review.changes).toContainEqual({
      label: 'Stock remaining',
      before: '500',
      after: '250',
    });
  });
  it('shows image preview acceptance separately and bounds long persisted labels and fields', () => {
    const review = buildAppActionReview({
      operationId: 'generateRecipeImage',
      path: '/recipes/{recipeId}/images/generate',
      method: 'POST',
      parameters: { recipeId: 'recipe-id' },
      snapshot: { recipe: { title: 'Soup'.repeat(200) } },
      body: null,
    });
    expect(review.subject.label.length).toBeLessThan(200);
    expect(review.effect).toBe('Prepare an image preview');
    expect(review.caveats).toEqual([
      'Review and accept the preview separately; existing photos stay unchanged.',
    ]);
    expect(actionReviewLines(review)).toEqual([]);
  });
});

it('identifies both meals and dates in a swap, and names list order rather than UUIDs', () => {
  const review = buildAppActionReview({
    operationId: 'swapMealPlanEntries',
    path: '/meal-plan/swap',
    method: 'POST',
    parameters: {},
    body: { sourceId: 'source', targetId: 'target' },
    references: {
      sourceMeal: {
        meal: { title: 'Lentil supper', plannedFor: '2026-10-23', meal: 'dinner', servings: 4 },
      },
      targetMeal: {
        meal: { title: 'Sunday soup', plannedFor: '2026-10-25', meal: 'lunch', servings: 2 },
      },
    },
  });
  expect(review.subject.label).toBe('Lentil supper ↔ Sunday soup');
  expect(review.changes).toContainEqual({
    label: 'Lentil supper',
    before: '2026-10-23 · Dinner · 4 servings',
    after: '2026-10-25 · Lunch · 4 servings',
  });
  const list = buildAppActionReview({
    operationId: 'reorderShoppingListItems',
    path: '/shopping-lists/{listId}',
    method: 'PATCH',
    parameters: { listId: 'list' },
    body: { itemIds: ['b', 'a'] },
    snapshot: {
      list: {
        name: 'Weekend groceries',
        items: [
          { id: 'a', item: 'Apples' },
          { id: 'b', item: 'Bread' },
        ],
      },
    },
  });
  expect(list.changes).toEqual([
    { label: 'Position 1', before: 'Apples', after: 'Bread' },
    { label: 'Position 2', before: 'Bread', after: 'Apples' },
  ]);
});

it('uses the item selected in a catalog-match body and keeps cart units separate from purchase demand', () => {
  const review = buildAppActionReview({
    operationId: 'matchReviewedShoppingProduct',
    path: '/shopping-lists/{listId}/catalog-items',
    method: 'POST',
    parameters: { listId: 'weekend-list' },
    snapshot: {
      list: {
        name: 'Weekend groceries',
        items: [
          { id: 'other-item', item: 'Bread', quantity: 1, unit: 'loaf' },
          {
            id: 'chosen-item',
            item: 'Chopped tomatoes',
            quantity: 333,
            unit: 'g',
            cartQuantity: 2,
            cartUnit: 'can',
            cartLabel: 'Tinned chopped tomatoes',
            shoppingState: 'in_cart',
            checked: false,
          },
        ],
      },
    },
    body: {
      itemId: 'chosen-item',
      cartQuantity: 3,
      cartUnit: 'can',
      cartIntent: 'replace_existing',
    },
  });
  expect(review.subject.label).toBe('Chopped tomatoes');
  expect(review.subject.kind).toBe('Shopping item');
  expect(review.context).toContainEqual({ label: 'List', value: 'Weekend groceries' });
  expect(review.context).toContainEqual({ label: 'Amount to buy', value: '333 g' });
  expect(review.context).toContainEqual({ label: 'Cart amount', value: '2 can' });
  expect(review.context).toContainEqual({ label: 'Cart item', value: 'Tinned chopped tomatoes' });
  expect(review.changes).toContainEqual({ label: 'Cart amount', before: '2 can', after: '3 can' });
  expect(
    review.changes.some(
      (change) => change.label === 'Cart quantity' || change.label === 'Cart unit',
    ),
  ).toBe(false);
});

it.each([
  { cartQuantity: 2, cartUnit: null, expected: '2 (unit not recorded)' },
  { cartQuantity: 0, cartUnit: 'can', expected: '0 can' },
])(
  'never borrows the demand unit for a recorded cart amount: $expected',
  ({ cartQuantity, cartUnit, expected }) => {
    const review = buildAppActionReview({
      ...base,
      body: null,
      snapshot: {
        list: {
          name: 'Weekend groceries',
          items: [
            {
              id: 'item-secret-id',
              item: 'Tomatoes',
              quantity: 333,
              unit: 'g',
              cartQuantity,
              cartUnit,
              shoppingState: 'in_cart',
            },
          ],
        },
      },
    });
    expect(review.context).toContainEqual({ label: 'Cart amount', value: expected });
    expect(review.context).toContainEqual({ label: 'Amount to buy', value: '333 g' });
  },
);
