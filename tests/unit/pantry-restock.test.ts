import { describe, expect, it } from 'vitest';

import { calculatePantryRestock } from '@/lib/domain/pantry-restock';

describe('Pantry recurring shopping policy formula', () => {
  it.each([
    ['below_target', 7, 5, true],
    ['below_target', 15, 5, false],
    ['reorder_point', 7, 7, true],
    ['reorder_point', 15, 7, false],
    ['empty', 5, 5, true],
    ['empty', 6, 5, false],
  ] as const)('%s evaluates the projected post-meal reserve', (trigger, stock, demand, due) => {
    const result = calculatePantryRestock({
      mode: 'always_have',
      trigger,
      recipeRequirement: demand,
      usablePantry: stock,
      targetStock: 10,
      reorderThreshold: 7,
    });
    expect(result.triggered).toBe(due);
    expect(result.projectedRemainder).toBe(stock - demand);
  });

  it('adds the reserve to recipe consumption, rounds once, then subtracts recorded purchases', () => {
    expect(
      calculatePantryRestock({
        mode: 'always_have',
        trigger: 'below_target',
        recipeRequirement: 8,
        usablePantry: 3,
        targetStock: 12,
        purchaseIncrement: 12,
        manualExtra: 2,
        purchasedCoverage: 10,
      }),
    ).toMatchObject({
      recipeShortage: 5,
      policyContribution: 12,
      unroundedPurchaseGoal: 19,
      roundedPurchaseGoal: 24,
      remainingToBuy: 14,
    });
  });

  it('uses the greater of the per-trip baseline and Pantry-adjusted recipe shortage', () => {
    expect(
      calculatePantryRestock({
        mode: 'always_buy',
        trigger: 'below_target',
        recipeRequirement: 3,
        usablePantry: 2,
        purchaseIncrement: 6,
      }),
    ).toMatchObject({ recipeShortage: 1, roundedPurchaseGoal: 6, remainingToBuy: 6 });
    expect(
      calculatePantryRestock({
        mode: 'always_buy',
        trigger: 'below_target',
        recipeRequirement: 15,
        usablePantry: 2,
        purchaseIncrement: 6,
      }),
    ).toMatchObject({ recipeShortage: 13, roundedPurchaseGoal: 18, remainingToBuy: 18 });
  });

  it('does not invent an Always-have quantity when stock is uncertain', () => {
    expect(
      calculatePantryRestock({
        mode: 'always_have',
        trigger: 'empty',
        recipeRequirement: 2,
        usablePantry: 0,
        targetStock: 6,
        stockCertain: false,
      }),
    ).toMatchObject({ needsReview: true, remainingToBuy: null, triggered: false });
  });
});
