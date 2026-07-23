import AxeBuilder from '@axe-core/playwright';
import { expect, test, type Page, type TestInfo } from '@playwright/test';

import { completeInitialOnboarding } from './helpers/onboarding';

const ORIGIN = 'http://127.0.0.1:3100';

async function screenshot(page: Page, testInfo: TestInfo, name: string) {
  const path = testInfo.outputPath(`${name}.png`);
  await page.screenshot({ path, fullPage: true });
  await testInfo.attach(name, { path, contentType: 'image/png' });
}

async function expectContained(page: Page) {
  expect(await page.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth)).toBe(
    true,
  );
}

test('recipe and planner Pantry insight is truthful, durable, accessible, and responsive', async ({
  page,
}, testInfo) => {
  testInfo.setTimeout(180_000);
  const browserErrors: string[] = [];
  page.on('console', (message) => {
    if (message.type() === 'error') browserErrors.push(message.text());
  });
  page.on('pageerror', (error) => browserErrors.push(error.message));

  await page.setViewportSize({ width: 1280, height: 900 });
  await completeInitialOnboarding(page, 'Pantry planning kitchen', 'Maya');
  await expect(page.getByRole('heading', { name: 'Welcome to the kitchen, Maya.' })).toBeVisible();

  const locationResponse = await page.request.post('/api/v1/pantry/locations', {
    headers: { Origin: ORIGIN },
    data: { name: 'Planner shelf', storageType: 'pantry' },
  });
  expect(locationResponse.status()).toBe(201);
  const location = (await locationResponse.json()) as { location: { id: string } };
  const productResponse = await page.request.post('/api/v1/pantry/products', {
    headers: { Origin: ORIGIN },
    data: {
      displayName: 'Planner lentils',
      defaultInventoryUnit: 'g',
      defaultStorageType: 'pantry',
    },
  });
  expect(productResponse.status()).toBe(201);
  const product = (await productResponse.json()) as { product: { id: string } };
  const batchResponse = await page.request.post('/api/v1/pantry/batches', {
    headers: { Origin: ORIGIN },
    data: {
      productId: product.product.id,
      quantityRemaining: 300,
      originalQuantity: 300,
      unit: 'g',
      locationId: location.location.id,
      bestBeforeDate: '2027-04-02',
      expiryPrecision: 'exact',
    },
  });
  expect(batchResponse.status()).toBe(201);

  const recipeResponse = await page.request.post('/api/v1/recipes', {
    headers: { Origin: ORIGIN },
    data: {
      title: 'Planner lentil stew',
      summary: 'A deterministic Pantry planning recipe.',
      status: 'active',
      servings: '4 servings',
      prepMinutes: 10,
      cookMinutes: 20,
      restMinutes: 0,
      difficulty: '',
      cuisine: '',
      category: 'Dinner',
      tips: '',
      sharedNotes: '',
      sourceName: '',
      sourceUrl: '',
      originalAuthor: '',
      cookingMethod: '',
      equipment: [],
      tags: ['pantry-plan'],
      ingredientGroups: [
        {
          name: '',
          ingredients: [{ quantity: 100, unit: 'g', item: 'lentils exactly as written', note: '' }],
        },
      ],
      instructionSections: [{ title: '', steps: ['Simmer until tender.'] }],
    },
  });
  expect(recipeResponse.status()).toBe(201);
  const recipe = (await recipeResponse.json()) as {
    recipe: { id: string; ingredientGroups: Array<{ ingredients: Array<{ id: string }> }> };
  };
  const ingredientId = recipe.recipe.ingredientGroups[0]!.ingredients[0]!.id;
  const mappingResponse = await page.request.put(`/api/v1/pantry/mappings/${ingredientId}`, {
    headers: { Origin: ORIGIN },
    data: { productId: product.product.id, compatibleVariant: false, isOptional: false },
  });
  expect(mappingResponse.ok()).toBe(true);

  const mealIds: string[] = [];
  for (const plannedFor of ['2027-04-03', '2027-04-05']) {
    const response = await page.request.post('/api/v1/meal-plan', {
      headers: { Origin: ORIGIN },
      data: {
        plannedFor,
        meal: 'dinner',
        recipeId: recipe.recipe.id,
        title: '',
        servings: 4,
        note: '',
      },
    });
    expect(response.status()).toBe(201);
    mealIds.push(((await response.json()) as { meal: { id: string } }).meal.id);
  }

  await page.setViewportSize({ width: 768, height: 900 });
  await page.goto('/recipes?pantry=ready');
  await expect(page.getByRole('heading', { name: 'Your recipe library' })).toBeVisible();
  await expect(
    page
      .getByRole('region', { name: 'Recipe results' })
      .getByRole('link', { name: 'Open Planner lentil stew', exact: true }),
  ).toBeVisible();
  await expect(page.getByText(/1 covered · 0 short · 0 unknown/u)).toBeVisible();
  await expectContained(page);
  expect((await new AxeBuilder({ page }).analyze()).violations).toEqual([]);
  await screenshot(page, testInfo, 'pantry-recipe-library-768');

  await page.setViewportSize({ width: 390, height: 844 });
  await page.goto(`/recipes/${recipe.recipe.id}`);
  const panel = page.getByRole('region', { name: 'What you have on hand' });
  await panel.getByRole('spinbutton', { name: 'Check servings' }).fill('8');
  await panel.getByRole('button', { name: 'Recalculate' }).click();
  await expect(panel.getByText(/Need 200 g · exact available 300 g/u)).toBeVisible();
  await expect(
    panel.getByText(/Planned commitments 200 g · projected remainder -100 g/u),
  ).toBeVisible();
  await panel.getByText('1 matching Pantry batches').focus();
  await page.keyboard.press('Enter');
  await expect(panel.getByText(/recorded date 2027-04-02/u)).toBeVisible();
  await expectContained(page);
  expect((await new AxeBuilder({ page }).analyze()).violations).toEqual([]);
  await screenshot(page, testInfo, 'pantry-recipe-detail-390');

  await page.setViewportSize({ width: 1280, height: 900 });
  await page.goto('/planner?week=2027-04-01');
  const statusControls = page.getByRole('combobox', { name: 'Status for Planner lentil stew' });
  await expect(statusControls).toHaveCount(2);
  await statusControls.nth(1).focus();
  await page.keyboard.press('ArrowDown');
  await page.keyboard.press('Enter');
  await expect(page.getByRole('status').filter({ hasText: 'Meal marked skipped.' })).toContainText(
    'Meal marked skipped.',
  );
  await page.reload();
  await expect(
    page.getByRole('combobox', { name: 'Status for Planner lentil stew' }).nth(1),
  ).toHaveValue('skipped');
  const demand = page.getByRole('region', { name: 'Across this whole week' });
  await expect(
    demand.getByText(/Need 100 g · exact compatible stock 300 g · covered/u),
  ).toBeVisible();
  await expect(demand.getByText(/exact stock runs short/u)).toHaveCount(0);
  await expect(demand.getByText(/planning context, not food-safety advice/u)).toBeVisible();
  await expectContained(page);
  expect((await new AxeBuilder({ page }).analyze()).violations).toEqual([]);
  await screenshot(page, testInfo, 'pantry-planner-1280');

  const persisted = await page.request.get(
    `/api/v1/pantry/demand?weekStart=2027-04-01&weekEnd=2027-04-07`,
  );
  expect(persisted.ok()).toBe(true);
  expect(
    ((await persisted.json()) as { demand: { lines: Array<{ requiredQuantity: number }> } }).demand
      .lines[0]?.requiredQuantity,
  ).toBe(100);
  expect(mealIds).toHaveLength(2);
  expect(browserErrors).toEqual([]);
});
