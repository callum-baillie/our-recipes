import AxeBuilder from '@axe-core/playwright';
import { expect, test, type Page, type TestInfo } from '@playwright/test';

import { completeInitialOnboarding } from './helpers/onboarding';

const ORIGIN = 'http://127.0.0.1:3100';

async function capture(page: Page, testInfo: TestInfo, name: string) {
  const path = testInfo.outputPath(`${name}.png`);
  await page.screenshot({ path, fullPage: true, caret: 'initial' });
  await testInfo.attach(name, { path, contentType: 'image/png' });
  expect(await page.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth)).toBe(
    true,
  );
  expect((await new AxeBuilder({ page }).analyze()).violations).toEqual([]);
}

test('planned cooking reviews exact FEFO stock and only deducts after literal confirmation', async ({
  page,
}, testInfo) => {
  testInfo.setTimeout(180_000);
  const browserErrors: string[] = [];
  page.on('console', (message) => {
    if (message.type() === 'error') browserErrors.push(message.text());
  });
  page.on('pageerror', (error) => browserErrors.push(error.message));

  await completeInitialOnboarding(page, 'Cooking confirmation kitchen', 'Maya');

  const location = await page.request.post('/api/v1/pantry/locations', {
    headers: { Origin: ORIGIN },
    data: { name: 'Cooking shelf', storageType: 'refrigerator' },
  });
  const locationId = ((await location.json()) as { location: { id: string } }).location.id;
  const makeProduct = async (displayName: string) => {
    const response = await page.request.post('/api/v1/pantry/products', {
      headers: { Origin: ORIGIN },
      data: { displayName, defaultInventoryUnit: 'g', defaultStorageType: 'refrigerator' },
    });
    return ((await response.json()) as { product: { id: string } }).product.id;
  };
  const productId = await makeProduct('Cooking lentils');
  const alternativeId = await makeProduct('Alternative lentils');
  const addBatch = async (product: string, quantity: number, useByDate: string) => {
    const response = await page.request.post('/api/v1/pantry/batches', {
      headers: { Origin: ORIGIN },
      data: {
        productId: product,
        quantityRemaining: quantity,
        originalQuantity: quantity,
        unit: 'g',
        locationId,
        useByDate,
        expiryPrecision: 'exact',
      },
    });
    expect(response.status()).toBe(201);
  };
  await addBatch(productId, 100, '2027-04-01');
  await addBatch(productId, 200, '2027-05-01');
  await addBatch(alternativeId, 500, '2027-06-01');

  const recipeResponse = await page.request.post('/api/v1/recipes', {
    headers: { Origin: ORIGIN },
    data: {
      title: 'Cooking lentil stew',
      summary: 'Cooking confirmation fixture.',
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
        { name: '', ingredients: [{ quantity: 150, unit: 'g', item: 'lentils', note: '' }] },
      ],
      instructionSections: [{ title: '', steps: ['Simmer until tender.'] }],
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
  const mealResponse = await page.request.post('/api/v1/meal-plan', {
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
  const mealId = ((await mealResponse.json()) as { meal: { id: string } }).meal.id;

  await page.setViewportSize({ width: 1280, height: 900 });
  await page.goto('/planner?week=2027-04-01');
  const cookLink = page.getByRole('link', {
    name: 'Cook Cooking lentil stew from this planned meal',
  });
  await expect(cookLink).toHaveAttribute(
    'href',
    `/recipes/${recipe.recipe.id}/cook?mealPlanEntryId=${mealId}`,
  );
  await capture(page, testInfo, 'pantry-cooking-planner-1280');
  await Promise.all([
    page.waitForURL(`**/recipes/${recipe.recipe.id}/cook?mealPlanEntryId=${mealId}`),
    cookLink.click(),
  ]);
  const startCooking = page.getByRole('button', { name: 'Start cooking' });
  await expect(startCooking).toBeVisible();
  await startCooking.click();
  await page.getByRole('button', { name: 'Finish cooking' }).click();

  await page.setViewportSize({ width: 390, height: 844 });
  await expect(
    page.getByText('Nothing is deducted until you press the confirmation button below.'),
  ).toBeVisible();
  await expect(page.getByText(/Planned meal: Cooking lentil stew/u)).toBeVisible();
  await expect(
    page.getByText(/Cooking shelf · expires 2027-04-01 · 100 g from 100 g/u),
  ).toBeVisible();
  await expect(
    page.getByText(/Cooking shelf · expires 2027-05-01 · 50 g from 200 g/u),
  ).toBeVisible();
  const before = await page.request.get('/api/v1/pantry/summary');
  const beforeBatches = (
    (await before.json()) as {
      dashboard: { batches: Array<{ productId: string; quantityRemaining: number }> };
    }
  ).dashboard.batches;
  expect(
    beforeBatches
      .filter((batch) => batch.productId === productId)
      .reduce((sum, batch) => sum + batch.quantityRemaining, 0),
  ).toBe(300);
  const productSelect = page.getByLabel('lentils Pantry product');
  await productSelect.selectOption(alternativeId);
  await expect(page.getByText(/expires 2027-06-01/u)).toBeVisible();
  await productSelect.selectOption(productId);
  await page.getByLabel('lentils deduction quantity').fill('120');
  await page.getByLabel('lentils deduction quantity').blur();
  await expect(page.getByText(/20 g from 200 g/u)).toBeVisible();
  await page.getByRole('button', { name: 'Add leftover' }).click();
  await page.getByRole('button', { name: 'Add leftover' }).click();
  await expect(page.getByRole('group', { name: 'Leftover 2' })).toBeVisible();
  await page.getByRole('button', { name: 'Remove' }).first().click();
  await page.getByRole('button', { name: 'Remove' }).first().click();
  await capture(page, testInfo, 'pantry-cooking-confirmation-390');
  await page.getByRole('button', { name: 'Confirm Pantry changes and finish cooking' }).click();

  await page.setViewportSize({ width: 768, height: 900 });
  await expect(page.getByRole('status')).toContainText('Cooking complete and Pantry updated.');
  await expect(page.getByRole('link', { name: 'View updated Pantry' })).toBeVisible();
  await expect(
    page.getByRole('link', { name: 'View updated meal plan and groceries' }),
  ).toBeVisible();
  await capture(page, testInfo, 'pantry-cooking-complete-768');
  await page.getByRole('button', { name: 'Undo Pantry deduction' }).click();
  await expect(page.getByRole('status')).toContainText('Pantry deductions undone.');
  expect(browserErrors).toEqual([]);
});
