import { appAxe } from './helpers/accessibility';
import { expect, test } from '@playwright/test';

import { completeInitialOnboarding } from './helpers/onboarding';

const ORIGIN = 'http://127.0.0.1:3100';
const mutation = { Origin: ORIGIN };

test('Always-have and Always-buy policies merge into one accessible Next-shop row', async ({
  page,
}) => {
  test.setTimeout(180_000);
  const browserErrors: string[] = [];
  page.on('console', (message) => {
    if (message.type() === 'error') browserErrors.push(message.text());
  });
  page.on('pageerror', (error) => browserErrors.push(error.message));
  await completeInitialOnboarding(page, 'Essentials household', 'Maya');

  const eggsResponse = await page.request.post('/api/v1/pantry/products', {
    headers: mutation,
    data: {
      displayName: 'Policy eggs',
      defaultInventoryUnit: 'each',
      stockUnit: 'each',
      restockMode: 'always_have',
      restockTrigger: 'empty',
      targetStock: 12,
      preferredPurchaseQuantity: 12,
    },
  });
  expect(eggsResponse.status()).toBe(201);
  const eggsId = ((await eggsResponse.json()) as { product: { id: string } }).product.id;
  let lists = (await (await page.request.get('/api/v1/shopping-lists')).json()) as {
    lists: Array<{ id: string; isAutomaticRestockTarget: boolean }>;
  };
  const automatic = lists.lists.find((list) => list.isAutomaticRestockTarget);
  expect(automatic).toBeTruthy();
  const automaticDetail = (await (
    await page.request.get(`/api/v1/shopping-lists/${automatic!.id}`)
  ).json()) as { list: { items: Array<{ quantity: number }> } };
  expect(automaticDetail.list.items).toHaveLength(1);
  expect(automaticDetail.list.items[0]!.quantity).toBe(12);

  const recipeResponse = await page.request.post('/api/v1/recipes', {
    headers: mutation,
    data: {
      title: 'Policy omelette',
      summary: '',
      status: 'active',
      servings: '2',
      prepMinutes: 0,
      cookMinutes: 10,
      restMinutes: 0,
      difficulty: '',
      cuisine: '',
      category: '',
      tips: '',
      sharedNotes: '',
      sourceName: '',
      sourceUrl: '',
      originalAuthor: '',
      cookingMethod: '',
      equipment: [],
      tags: [],
      ingredientGroups: [
        { name: '', ingredients: [{ quantity: 4, unit: 'each', item: 'eggs', note: '' }] },
      ],
      instructionSections: [{ title: '', steps: ['Cook.'] }],
    },
  });
  const recipe = (await recipeResponse.json()) as {
    recipe: { id: string; ingredientGroups: Array<{ ingredients: Array<{ id: string }> }> };
  };
  await page.request.put(
    `/api/v1/pantry/mappings/${recipe.recipe.ingredientGroups[0]!.ingredients[0]!.id}`,
    { headers: mutation, data: { productId: eggsId, compatibleVariant: false, isOptional: false } },
  );
  await page.request.post('/api/v1/meal-plan', {
    headers: mutation,
    data: {
      plannedFor: '2027-04-03',
      meal: 'dinner',
      recipeId: recipe.recipe.id,
      title: '',
      servings: 2,
      note: '',
    },
  });
  const plannedResponse = await page.request.post('/api/v1/shopping-lists', {
    headers: { ...mutation, 'Idempotency-Key': 'policy-planner-list' },
    data: {
      kind: 'planner',
      weekStart: '2027-04-01',
      weekEnd: '2027-04-07',
      sourceMode: 'pantry_all',
      makeAutomaticRestockTarget: true,
    },
  });
  expect(plannedResponse.status()).toBe(201);
  const planned = (await plannedResponse.json()) as {
    list: {
      id: string;
      isAutomaticRestockTarget: boolean;
      items: Array<{
        quantity: number;
        policyBreakdown: { recipeRequirement: number; finalBuyQuantity: number } | null;
      }>;
    };
  };
  expect(planned.list.isAutomaticRestockTarget).toBe(true);
  expect(planned.list.items).toHaveLength(1);
  expect(planned.list.items[0]).toMatchObject({
    quantity: 24,
    policyBreakdown: { recipeRequirement: 4, finalBuyQuantity: 24 },
  });

  const milkResponse = await page.request.post('/api/v1/pantry/products', {
    headers: mutation,
    data: {
      displayName: 'Policy milk',
      defaultInventoryUnit: 'bottle',
      stockUnit: 'bottle',
      restockMode: 'always_buy',
      restockTrigger: 'below_target',
      preferredPurchaseQuantity: 2,
    },
  });
  expect(milkResponse.status()).toBe(201);
  const withMilk = (await (
    await page.request.get(`/api/v1/shopping-lists/${planned.list.id}`)
  ).json()) as {
    list: {
      items: Array<{
        item: string;
        quantity: number;
        policyBreakdown: { mode: string; finalBuyQuantity: number } | null;
      }>;
    };
  };
  expect(withMilk.list.items.find((item) => item.item === 'Policy milk')).toMatchObject({
    quantity: 2,
    policyBreakdown: { mode: 'always_buy', finalBuyQuantity: 2 },
  });

  await page.setViewportSize({ width: 390, height: 844 });
  await page.goto(`/lists/${planned.list.id}`);
  await expect(
    page
      .locator('strong')
      .filter({ hasText: /^Next shop$/u })
      .first(),
  ).toBeVisible();
  const eggsRow = page.locator('article').filter({
    has: page.getByText('Policy eggs', { exact: true }),
  });
  const milkRow = page.locator('article').filter({
    has: page.getByText('Policy milk', { exact: true }),
  });
  await eggsRow.getByText('Demand and policy breakdown', { exact: true }).click();
  await milkRow.getByText('Demand and policy breakdown', { exact: true }).click();
  await expect(eggsRow.getByText('Always have reserve', { exact: true })).toBeVisible();
  await expect(milkRow.getByText('Always buy baseline', { exact: true })).toBeVisible();
  await expect(page.getByText(/24 each/u).first()).toBeVisible();
  const overflow = await page.evaluate(
    () => document.documentElement.scrollWidth - window.innerWidth,
  );
  expect(overflow).toBeLessThanOrEqual(1);
  expect((await appAxe(page).analyze()).violations).toEqual([]);
  expect(browserErrors).toEqual([]);

  lists = (await (await page.request.get('/api/v1/shopping-lists')).json()) as typeof lists;
  expect(lists.lists.filter((list) => list.isAutomaticRestockTarget)).toHaveLength(1);
});
