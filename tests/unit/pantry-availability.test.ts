import { describe, expect, it } from 'vitest';

import {
  calculateProjectedDemand,
  calculateRecipeAvailability,
  pantryDemandQuerySchema,
  type AvailabilityIngredient,
  type AvailabilityStock,
} from '@/lib/domain/pantry-availability';

const ingredient: AvailabilityIngredient = {
  id: 'ingredient-1',
  item: 'Red lentils',
  quantity: 100,
  unit: 'g',
  productId: 'product-1',
  productName: 'Red lentils',
  isOptional: false,
};

describe('recipe Pantry availability', () => {
  it('scales exact compatible stock to the requested servings', () => {
    const result = calculateRecipeAvailability({
      recipeId: 'recipe-1',
      recipeTitle: 'Lentil soup',
      baseServings: 4,
      targetServings: 8,
      ingredients: [ingredient],
      stock: [
        {
          batchId: 'batch-1',
          productId: 'product-1',
          quantity: 0.25,
          unit: 'kg',
          approximateState: null,
        },
      ],
    });

    expect(result.state).toBe('ready');
    expect(result.ingredients[0]).toMatchObject({
      requiredQuantity: 200,
      availableQuantity: 250,
      shortageQuantity: 0,
    });
  });

  it('keeps approximate, incompatible, unmapped, and missing quantities unknown', () => {
    const stock: AvailabilityStock[] = [
      {
        batchId: 'batch-1',
        productId: 'product-1',
        quantity: null,
        unit: 'g',
        approximateState: 'half',
      },
      {
        batchId: 'batch-2',
        productId: 'product-1',
        quantity: 3,
        unit: 'each',
        approximateState: null,
      },
    ];
    const result = calculateRecipeAvailability({
      recipeId: 'recipe-1',
      recipeTitle: 'Lentil soup',
      baseServings: 4,
      ingredients: [
        ingredient,
        { ...ingredient, id: 'ingredient-2', productId: null, productName: null },
        { ...ingredient, id: 'ingredient-3', quantity: null },
      ],
      stock,
    });

    expect(result.state).toBe('unknown');
    expect(result.ingredients.map((item) => item.state)).toEqual(['unknown', 'unknown', 'unknown']);
    expect(result.ingredients[0]?.availableQuantity).toBe(0);
    expect(result.ingredients[0]?.shortageQuantity).toBeNull();
  });

  it('allocates one product pool once across duplicate recipe ingredients', () => {
    const result = calculateRecipeAvailability({
      recipeId: 'recipe-1',
      recipeTitle: 'Layered lentils',
      baseServings: 4,
      ingredients: [ingredient, { ...ingredient, id: 'ingredient-2', item: 'Lentil topping' }],
      stock: [
        {
          batchId: 'batch-1',
          productId: 'product-1',
          quantity: 150,
          unit: 'g',
          approximateState: null,
        },
      ],
    });

    expect(result.state).toBe('partial');
    expect(result.ingredients).toMatchObject([
      { id: 'ingredient-1', state: 'ready', availableQuantity: 150, shortageQuantity: 0 },
      { id: 'ingredient-2', state: 'partial', availableQuantity: 50, shortageQuantity: 50 },
    ]);
  });

  it('allocates required ingredients before optional ingredients without changing response order', () => {
    const optional = {
      ...ingredient,
      id: 'ingredient-optional',
      item: 'Optional lentil topping',
      quantity: 100,
      isOptional: true,
    };
    const result = calculateRecipeAvailability({
      recipeId: 'recipe-1',
      recipeTitle: 'Layered lentils',
      baseServings: 4,
      ingredients: [optional, ingredient],
      stock: [
        {
          batchId: 'batch-1',
          productId: 'product-1',
          quantity: 150,
          unit: 'g',
          approximateState: null,
        },
      ],
    });

    expect(result.state).toBe('ready');
    expect(result.ingredients).toMatchObject([
      {
        id: 'ingredient-optional',
        state: 'partial',
        availableQuantity: 50,
        shortageQuantity: 50,
      },
      { id: 'ingredient-1', state: 'ready', availableQuantity: 150, shortageQuantity: 0 },
    ]);
  });
});

describe('projected Pantry demand', () => {
  it('aggregates multiple meals and counts each compatible exact batch once without mutation', () => {
    const stock: AvailabilityStock[] = [
      {
        batchId: 'batch-1',
        productId: 'product-1',
        quantity: 250,
        unit: 'g',
        approximateState: null,
      },
    ];
    const result = calculateProjectedDemand({
      weekStart: '2026-07-20',
      weekEnd: '2026-07-26',
      stock,
      requirements: [
        {
          mealPlanEntryId: 'meal-1',
          plannedFor: '2026-07-20',
          recipeId: 'recipe-1',
          recipeTitle: 'Lentil soup',
          ingredientId: 'ingredient-1',
          ingredientName: 'Red lentils',
          productId: 'product-1',
          productName: 'Red lentils',
          quantity: 100,
          unit: 'g',
          reason: null,
        },
        {
          mealPlanEntryId: 'meal-2',
          plannedFor: '2026-07-22',
          recipeId: 'recipe-1',
          recipeTitle: 'Lentil soup',
          ingredientId: 'ingredient-1',
          ingredientName: 'Red lentils',
          productId: 'product-1',
          productName: 'Red lentils',
          quantity: 0.2,
          unit: 'kg',
          reason: null,
        },
      ],
    });

    expect(result.lines[0]).toMatchObject({
      requiredQuantity: 300,
      availableQuantity: 250,
      shortageQuantity: 50,
      state: 'shortage',
      uncertaintyReason: null,
      projectedRemainderQuantity: -50,
      exhaustionDate: '2026-07-22',
    });
    expect(result.lines[0]?.meals).toHaveLength(2);
    expect(stock[0]?.quantity).toBe(250);
  });

  it('reports recorded expiry-before-meal conflicts without mutating stock or making safety claims', () => {
    const stock: AvailabilityStock[] = [
      {
        batchId: 'dated-batch',
        productId: 'product-1',
        quantity: 150,
        unit: 'g',
        approximateState: null,
        locationName: 'Pantry shelf',
        expiryDate: '2026-07-19',
      },
    ];
    const result = calculateProjectedDemand({
      weekStart: '2026-07-20',
      weekEnd: '2026-07-26',
      stock,
      requirements: [
        {
          mealPlanEntryId: 'meal-1',
          plannedFor: '2026-07-21',
          recipeId: 'recipe-1',
          recipeTitle: 'Lentil soup',
          ingredientId: 'ingredient-1',
          ingredientName: 'Red lentils',
          productId: 'product-1',
          productName: 'Red lentils',
          quantity: 100,
          unit: 'g',
          reason: null,
        },
      ],
    });

    expect(result.lines[0]).toMatchObject({
      earliestExpiryDate: '2026-07-19',
      projectedRemainderQuantity: 50,
      exhaustionDate: null,
    });
    expect(result.lines[0]?.expiryConflicts).toEqual([
      { batchId: 'dated-batch', expiryDate: '2026-07-19', plannedFor: '2026-07-21' },
    ]);
    expect(stock[0]?.quantity).toBe(150);
  });

  it('reports insufficient exact stock as uncertain when other stock cannot be counted', () => {
    const result = calculateProjectedDemand({
      weekStart: '2026-07-20',
      weekEnd: '2026-07-26',
      requirements: [
        {
          mealPlanEntryId: 'meal-1',
          plannedFor: '2026-07-20',
          recipeId: 'recipe-1',
          recipeTitle: 'Lentil soup',
          ingredientId: 'ingredient-1',
          ingredientName: 'Red lentils',
          productId: 'product-1',
          productName: 'Red lentils',
          quantity: 300,
          unit: 'g',
          reason: null,
        },
      ],
      stock: [
        {
          batchId: 'batch-1',
          productId: 'product-1',
          quantity: 100,
          unit: 'g',
          approximateState: null,
        },
        {
          batchId: 'batch-2',
          productId: 'product-1',
          quantity: null,
          unit: 'g',
          approximateState: 'half',
        },
        {
          batchId: 'batch-3',
          productId: 'product-1',
          quantity: 2,
          unit: 'each',
          approximateState: null,
        },
      ],
    });

    expect(result.lines[0]).toMatchObject({
      availableQuantity: 100,
      shortageQuantity: null,
      state: 'uncertain',
    });
    expect(result.lines[0]?.uncertaintyReason).toContain('approximate or incompatible');
  });

  it('accepts real ISO dates and rejects impossible calendar dates', () => {
    expect(
      pantryDemandQuerySchema.safeParse({
        weekStart: '2028-02-29',
        weekEnd: '2028-03-01',
      }).success,
    ).toBe(true);
    expect(
      pantryDemandQuerySchema.safeParse({
        weekStart: '2026-02-29',
        weekEnd: '2026-03-01',
      }).success,
    ).toBe(false);
    expect(
      pantryDemandQuerySchema.safeParse({
        weekStart: '2026-07-20',
        weekEnd: '2026-04-31',
      }).success,
    ).toBe(false);
  });
});
