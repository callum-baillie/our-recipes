import AxeBuilder from '@axe-core/playwright';
import { expect, test, type Page, type TestInfo } from '@playwright/test';

import { completeInitialOnboarding } from './helpers/onboarding';

const ORIGIN = 'http://127.0.0.1:3100';

async function screenshot(page: Page, testInfo: TestInfo, name: string) {
  const path = testInfo.outputPath(`${name}.png`);
  await page.screenshot({ path, fullPage: true });
  await testInfo.attach(name, { path, contentType: 'image/png' });
}

async function expectCleanResponsivePage(page: Page) {
  expect(await page.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth)).toBe(
    true,
  );
  expect(await new AxeBuilder({ page }).analyze()).toMatchObject({ violations: [] });
}

test('Pantry grocery formula, controls, and explicit rich intake persist responsively', async ({
  page,
}, testInfo) => {
  testInfo.setTimeout(180_000);
  const browserErrors: string[] = [];
  page.on('console', (message) => {
    if (message.type() === 'error') browserErrors.push(message.text());
  });
  page.on('pageerror', (error) => browserErrors.push(error.message));

  await page.setViewportSize({ width: 1280, height: 900 });
  await completeInitialOnboarding(page, 'Pantry grocery kitchen', 'Maya');

  const locationResponse = await page.request.post('/api/v1/pantry/locations', {
    headers: { Origin: ORIGIN },
    data: { name: 'Grocery shelf', storageType: 'pantry' },
  });
  const locationId = ((await locationResponse.json()) as { location: { id: string } }).location.id;
  const productResponse = await page.request.post('/api/v1/pantry/products', {
    headers: { Origin: ORIGIN },
    data: {
      displayName: 'Grocery lentils',
      defaultInventoryUnit: 'g',
      stockUnit: 'g',
      defaultStorageType: 'pantry',
      isStaple: true,
      suggestGroceryRestock: true,
      reorderThreshold: 300,
      targetStock: 500,
    },
  });
  const productId = ((await productResponse.json()) as { product: { id: string } }).product.id;
  for (const batch of [
    { quantityRemaining: 100, excludeFromGrocery: false },
    { quantityRemaining: 1_000, excludeFromGrocery: true },
  ]) {
    expect(
      (
        await page.request.post('/api/v1/pantry/batches', {
          headers: { Origin: ORIGIN },
          data: {
            productId,
            originalQuantity: batch.quantityRemaining,
            unit: 'g',
            locationId,
            expiryPrecision: 'unknown',
            ...batch,
          },
        })
      ).status(),
    ).toBe(201);
  }

  const recipeResponse = await page.request.post('/api/v1/recipes', {
    headers: { Origin: ORIGIN },
    data: {
      title: 'Grocery lentil bowl',
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
        { name: '', ingredients: [{ quantity: 200, unit: 'g', item: 'lentils', note: '' }] },
      ],
      instructionSections: [{ title: '', steps: ['Cook.'] }],
    },
  });
  const recipe = (await recipeResponse.json()) as {
    recipe: { id: string; ingredientGroups: Array<{ ingredients: Array<{ id: string }> }> };
  };
  await page.request.put(
    `/api/v1/pantry/mappings/${recipe.recipe.ingredientGroups[0]!.ingredients[0]!.id}`,
    {
      headers: { Origin: ORIGIN },
      data: { productId, compatibleVariant: false, isOptional: false },
    },
  );
  await page.request.post('/api/v1/meal-plan', {
    headers: { Origin: ORIGIN },
    data: {
      plannedFor: '2027-04-03',
      meal: 'dinner',
      recipeId: recipe.recipe.id,
      title: '',
      servings: 2,
      note: '',
    },
  });

  const generatedResponse = await page.request.post('/api/v1/shopping-lists/pantry-shortages', {
    headers: { Origin: ORIGIN },
    data: { weekStart: '2027-04-01', weekEnd: '2027-04-07', mode: 'all' },
  });
  expect(generatedResponse.status()).toBe(201);
  const listId = ((await generatedResponse.json()) as { listId: string }).listId;
  let list = (await (await page.request.get(`/api/v1/shopping-lists/${listId}`)).json()) as {
    list: { items: Array<{ id: string; quantity: number; pantry: { formulaInputs: string } }> };
  };
  expect(list.list.items[0]!.quantity).toBe(400);
  expect(JSON.parse(list.list.items[0]!.pantry.formulaInputs)).toMatchObject({
    recipeRequirement: 200,
    stapleTarget: 500,
    usablePantry: 100,
    shortageQuantity: 400,
  });
  const itemId = list.list.items[0]!.id;

  await page.setViewportSize({ width: 390, height: 844 });
  await page.goto(`/lists/${listId}`);
  await page.getByText(/Generated Pantry shortage/u).focus();
  await page.keyboard.press('Enter');
  await expect(page.getByRole('link', { name: 'Open Pantry' })).toBeVisible();
  await expect(page.getByText(/Substitution is not available here/u)).toBeVisible();
  await expect(page.getByText('Record an actual Pantry purchase')).toHaveCount(0);
  await page.getByLabel('Extra quantity for Grocery lentils').fill('50');
  await page.getByLabel('Extra unit for Grocery lentils').fill('g');
  const extraResponse = page.waitForResponse(
    (response) =>
      response.url().endsWith(`/items/${itemId}/pantry-controls`) &&
      response.request().method() === 'PATCH',
  );
  const applicationReload = page.waitForEvent('load');
  await page.getByRole('button', { name: 'Add entered quantity as extra' }).click();
  expect((await extraResponse).status()).toBe(200);
  await applicationReload;

  await page.request.post('/api/v1/shopping-lists/pantry-shortages', {
    headers: { Origin: ORIGIN },
    data: { weekStart: '2027-04-01', weekEnd: '2027-04-07', mode: 'all', listId },
  });
  await page.reload();
  await expect(page.getByLabel('Grocery lentils quantity')).toHaveValue('450');
  await expectCleanResponsivePage(page);
  await screenshot(page, testInfo, 'pantry-grocery-controls-390');

  await page.getByText(/Generated Pantry shortage/u).focus();
  await page.keyboard.press('Enter');
  await page.getByRole('button', { name: 'Ignore Pantry stock' }).click();
  await page.request.post('/api/v1/shopping-lists/pantry-shortages', {
    headers: { Origin: ORIGIN },
    data: { weekStart: '2027-04-01', weekEnd: '2027-04-07', mode: 'all', listId },
  });
  list = (await (await page.request.get(`/api/v1/shopping-lists/${listId}`)).json()) as typeof list;
  expect(list.list.items[0]!.quantity).toBe(550);

  await page.setViewportSize({ width: 768, height: 900 });
  await page.goto(`/lists/${listId}`);
  await page.getByText(/Pantry stock ignored/u).click();
  const checkedResponse = page.waitForResponse(
    (response) =>
      response.url().endsWith(`/items/${itemId}`) && response.request().method() === 'PATCH',
  );
  await page.getByLabel('Mark Grocery lentils complete').check();
  expect((await checkedResponse).status()).toBe(200);
  await expect(page.getByText('Record an actual Pantry purchase')).toBeVisible();
  await page.getByLabel('Purchased quantity for Grocery lentils').fill('100');
  await page.getByLabel('Purchased unit for Grocery lentils').fill('g');
  await page.getByLabel('Coverage mode for Grocery lentils').selectOption('partial');
  await page.getByLabel('Package count for Grocery lentils').fill('2');
  await page.getByLabel('Amount per package for Grocery lentils').fill('50');
  await page.getByLabel('Package unit for Grocery lentils').fill('g');
  await page.getByLabel('Shelf or sublocation for Grocery lentils').fill('Top shelf');
  await page.getByLabel('Purchase date').fill('2027-04-01');
  await page.getByLabel('Best-before date').fill('2027-06-01');
  await page.getByLabel('Use-by date').fill('2027-05-20');
  await page.getByLabel('Purchase price in cents for Grocery lentils').fill('499');
  await page.getByLabel('Store for Grocery lentils').fill('Market');
  await page.getByLabel('Purchase notes for Grocery lentils').fill('Two bags');
  await page.getByRole('button', { name: 'Confirm and add to Pantry' }).click();
  await expect(
    page.getByText('Added to Pantry. A later purchase can be added separately.', { exact: true }),
  ).toBeVisible();
  await expectCleanResponsivePage(page);
  await screenshot(page, testInfo, 'pantry-rich-intake-768');

  const replayPayload = {
    operationKey: 'browser-replay-proof',
    productId,
    locationId,
    quantity: 25,
    unit: 'g',
    intakeMode: 'complete',
  };
  const firstReplay = await page.request.post(
    `/api/v1/shopping-lists/${listId}/items/${itemId}/pantry-intake`,
    { headers: { Origin: ORIGIN }, data: replayPayload },
  );
  const secondReplay = await page.request.post(
    `/api/v1/shopping-lists/${listId}/items/${itemId}/pantry-intake`,
    { headers: { Origin: ORIGIN }, data: replayPayload },
  );
  expect(firstReplay.status()).toBe(201);
  expect(secondReplay.status()).toBe(200);
  expect((await secondReplay.json()).replayed).toBe(true);

  await page.request.patch(`/api/v1/shopping-lists/${listId}/items/${itemId}/pantry-controls`, {
    headers: { Origin: ORIGIN },
    data: { action: 'covered' },
  });
  await page.request.post('/api/v1/shopping-lists/pantry-shortages', {
    headers: { Origin: ORIGIN },
    data: { weekStart: '2027-04-01', weekEnd: '2027-04-07', mode: 'missing', listId },
  });
  expect(
    ((await (await page.request.get(`/api/v1/shopping-lists/${listId}`)).json()) as typeof list)
      .list.items,
  ).toHaveLength(0);
  await page.request.post('/api/v1/shopping-lists/pantry-shortages', {
    headers: { Origin: ORIGIN },
    data: { weekStart: '2027-04-01', weekEnd: '2027-04-07', mode: 'all', listId },
  });

  await page.setViewportSize({ width: 1280, height: 900 });
  await page.goto(`/lists/${listId}`);
  await expect(page.getByText(/Covered · no purchase currently needed/u)).toBeVisible();
  await expectCleanResponsivePage(page);
  await screenshot(page, testInfo, 'pantry-covered-all-1280');
  expect(browserErrors).toEqual([]);
});
