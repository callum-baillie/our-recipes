import AxeBuilder from '@axe-core/playwright';
import { expect, test, type Page, type TestInfo } from '@playwright/test';

import { completeInitialOnboarding } from './helpers/onboarding';

const ORIGIN = 'http://127.0.0.1:3100';
const WEEK_START = '2027-04-01';
const WEEK_END = '2027-04-07';

const recipePayload = {
  title: 'Pantry lentil stew',
  summary: 'A deterministic Pantry workflow recipe.',
  status: 'active',
  servings: '2 servings',
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
  nutritionCalories: '',
  nutritionProteinGrams: '',
  nutritionCarbohydrateGrams: '',
  nutritionFatGrams: '',
  nutritionSaturatedFatGrams: '',
  nutritionFiberGrams: '',
  nutritionSugarGrams: '',
  nutritionSodiumMilligrams: '',
  tags: ['pantry-proof'],
  ingredientGroups: [
    {
      name: '',
      ingredients: [{ quantity: 200, unit: 'g', item: 'red lentils', note: '' }],
    },
  ],
  instructionSections: [{ title: '', steps: ['Simmer the lentils until tender.'] }],
};

type PantryBatch = {
  id: string;
  productId: string;
  quantityRemaining: number | null;
  sourceShoppingListItemId: string | null;
  status: string;
};

async function pantryDashboard(page: Page) {
  const response = await page.request.get(
    '/api/v1/pantry/summary?view=all&sort=expiry&includeInactive=true',
  );
  expect(response.ok()).toBe(true);
  return (await response.json()) as {
    dashboard: {
      batches: PantryBatch[];
      products: Array<{ id: string; displayName: string }>;
      locations: Array<{ id: string; path: string }>;
    };
  };
}

async function addPantryBatch(
  page: Page,
  input: {
    productName?: string;
    existingProduct?: string;
    quantity: string;
    expiry: string;
    location?: string;
  },
) {
  const panel = page.locator('details', { hasText: 'Add Pantry item' });
  if ((await panel.getAttribute('open')) === null) {
    await panel.locator('summary').focus();
    await expect(panel.locator('summary')).toBeFocused();
    await page.keyboard.press('Enter');
  }
  if (input.existingProduct) {
    await panel.getByLabel('Existing product').selectOption({ label: input.existingProduct });
    await panel.getByLabel('New product name').fill('');
  } else {
    await panel.getByLabel('Existing product').selectOption('');
    await panel.getByLabel('New product name').fill(input.productName ?? '');
  }
  await panel.getByRole('spinbutton', { name: 'Quantity', exact: true }).fill(input.quantity);
  await panel.getByRole('combobox', { name: 'Unit', exact: true }).selectOption('g');
  if (input.location)
    await panel
      .getByRole('combobox', { name: 'Location', exact: true })
      .selectOption({ label: input.location });
  await panel.getByLabel('Best before').fill(input.expiry);
  await panel.getByRole('button', { name: 'Add item' }).focus();
  await page.keyboard.press('Enter');
  await expect(page.getByRole('status')).toHaveText('Pantry item added.');
}

async function screenshot(page: Page, testInfo: TestInfo, name: string) {
  const path = testInfo.outputPath(`${name}.png`);
  await page.screenshot({ path, fullPage: true });
  await testInfo.attach(name, { path, contentType: 'image/png' });
}

test('rendered Pantry workflow remains explainable, explicit, persistent, accessible, and responsive', async ({
  page,
}, testInfo) => {
  testInfo.setTimeout(180_000);
  const browserErrors: string[] = [];
  const externalRequests: string[] = [];
  page.on('console', (message) => {
    if (message.type() === 'error') browserErrors.push(message.text());
  });
  page.on('pageerror', (error) => browserErrors.push(error.message));
  page.on('request', (request) => {
    const url = new URL(request.url());
    if (url.origin !== ORIGIN && !['data:', 'blob:'].includes(url.protocol)) {
      externalRequests.push(request.url());
    }
  });

  await page.setViewportSize({ width: 1440, height: 1000 });
  await completeInitialOnboarding(page, 'Pantry final kitchen', 'Maya');
  await expect(page.getByRole('heading', { name: 'Welcome to the kitchen, Maya.' })).toBeVisible();

  await page.goto('/pantry');
  await expect(page).toHaveTitle('Pantry final kitchen');
  await expect(page.getByRole('heading', { name: 'Pantry', exact: true })).toBeVisible();
  await addPantryBatch(page, {
    productName: 'Red lentils',
    quantity: '100',
    expiry: '2027-04-10',
  });
  const afterDesktopAdd = await pantryDashboard(page);
  const product = afterDesktopAdd.dashboard.products.find(
    (candidate) => candidate.displayName === 'Red lentils',
  );
  expect(product).toBeTruthy();
  const nutritionRecord = await page.request.post(
    `/api/v1/nutrition/products/${product!.id}/records`,
    {
      headers: { Origin: ORIGIN },
      data: {
        basisType: 'per_100g',
        basisAmount: 100,
        basisUnit: 'g',
        confidence: 1,
        completeness: 1,
        values: [
          { nutrientCode: 'energy_kcal', amount: 352 },
          { nutrientCode: 'protein', amount: 25 },
        ],
      },
    },
  );
  expect(nutritionRecord.status()).toBe(201);
  const firstBatch = afterDesktopAdd.dashboard.batches.find(
    (batch) => batch.productId === product!.id,
  );
  expect(firstBatch?.quantityRemaining).toBe(100);
  await screenshot(page, testInfo, 'pantry-desktop-added');

  await page.setViewportSize({ width: 390, height: 844 });
  expect(
    await page.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth),
    'mobile Pantry should not horizontally overflow',
  ).toBe(true);
  const locationsSummary = page.getByText('Manage locations', { exact: true });
  await expect(locationsSummary).toHaveCount(1);
  const locations = page.locator('details', { has: locationsSummary });
  await expect(locations).toHaveCount(1);
  await locationsSummary.focus();
  await expect(locationsSummary).toBeFocused();
  await page.keyboard.press('Enter');
  const addLocationButton = page.getByRole('button', {
    name: 'Add location',
    exact: true,
  });
  await expect(addLocationButton).toHaveCount(1);
  const addLocationForm = locations.locator('form', { has: addLocationButton });
  await expect(addLocationForm).toHaveCount(1);
  await addLocationForm.getByRole('textbox', { name: 'Name', exact: true }).fill('Basement shelf');
  await addLocationForm
    .getByRole('combobox', { name: 'Storage type', exact: true })
    .selectOption('pantry');
  await addLocationForm.getByRole('button', { name: 'Add location', exact: true }).click();
  await expect(page.getByRole('status')).toHaveText('Storage location added.');
  await addPantryBatch(page, {
    existingProduct: 'Red lentils',
    quantity: '250',
    expiry: '2027-05-10',
    location: 'Basement shelf',
  });
  const lentilCards = page.locator('article', {
    has: page.getByRole('heading', { name: 'Red lentils', exact: true }),
  });
  await expect(lentilCards).toHaveCount(2);
  await lentilCards.first().getByRole('button', { name: 'Open' }).click();
  await expect(page.getByRole('status')).toHaveText('Package opened.');
  const mobileAxe = await new AxeBuilder({ page }).analyze();
  expect(mobileAxe.violations).toEqual([]);
  await screenshot(page, testInfo, 'pantry-mobile-managed');

  const afterMobileAdd = await pantryDashboard(page);
  const productBatches = afterMobileAdd.dashboard.batches.filter(
    (batch) => batch.productId === product!.id,
  );
  expect(productBatches).toHaveLength(2);
  const secondBatch = productBatches.find((batch) => batch.id !== firstBatch!.id)!;
  expect(secondBatch.quantityRemaining).toBe(250);

  const recipeResponse = await page.request.post('/api/v1/recipes', {
    headers: { Origin: ORIGIN },
    data: recipePayload,
  });
  expect(recipeResponse.status()).toBe(201);
  const { recipe } = (await recipeResponse.json()) as {
    recipe: { id: string; ingredientGroups: Array<{ ingredients: Array<{ id: string }> }> };
  };
  await page.setViewportSize({ width: 1440, height: 1000 });
  await page.goto(`/recipes/${recipe.id}`);
  const pantryPanel = page.getByRole('region', { name: 'What you have on hand' });
  await pantryPanel.getByLabel('Pantry product').selectOption({ label: 'Red lentils' });
  await expect(pantryPanel.getByRole('status')).toHaveText('Pantry mapping saved.');
  await page.reload();
  await expect(pantryPanel.getByText('Pantry ready', { exact: true }).first()).toBeVisible();
  await expect(pantryPanel.getByText(/Need 200 g · exact available 350 g/u)).toBeVisible();
  const calculationResponse = await page.request.post(
    `/api/v1/nutrition/recipes/${recipe.id}/calculations`,
    {
      headers: { Origin: ORIGIN },
      data: { includedOptionalIngredientIds: [], finalWeightGrams: 200 },
    },
  );
  expect(calculationResponse.status()).toBe(201);

  const plannedMeals: string[] = [];
  for (const plannedFor of ['2027-04-03', '2027-04-05']) {
    const response = await page.request.post('/api/v1/meal-plan', {
      headers: { Origin: ORIGIN },
      data: {
        plannedFor,
        meal: 'dinner',
        recipeId: recipe.id,
        title: '',
        servings: 2,
        note: '',
      },
    });
    expect(response.status()).toBe(201);
    plannedMeals.push(((await response.json()) as { meal: { id: string } }).meal.id);
  }

  await page.goto(`/planner?week=${WEEK_START}`);
  const demandPanel = page.getByRole('region', { name: 'Across this whole week' });
  await expect(
    demandPanel.getByText(/Need 400 g · exact compatible stock 350 g · short 50 g/u),
  ).toBeVisible();
  await expect(demandPanel.getByText(/2027-04-03 Pantry lentil stew/u)).toBeVisible();
  await expect(demandPanel.getByText(/2027-04-05 Pantry lentil stew/u)).toBeVisible();
  const generateList = demandPanel.getByRole('button', { name: 'Make shortage list' });
  await expect(generateList).toBeEnabled();
  const shortageCreation = page.waitForResponse(
    (response) =>
      response.request().method() === 'POST' &&
      new URL(response.url()).pathname === '/api/v1/shopping-lists/pantry-shortages',
  );
  await generateList.click();
  const shortageResponse = await shortageCreation;
  expect(shortageResponse.status()).toBe(201);
  const shortageBody = (await shortageResponse.json()) as { listId: string };
  expect(shortageBody.listId).toMatch(/^[0-9a-f-]+$/u);
  const listLink = demandPanel.getByRole('link', { name: 'Open grocery list' });
  await expect(listLink).toHaveAttribute('href', `/lists/${shortageBody.listId}`);
  const listId = shortageBody.listId;
  const shoppingEditorReady = page.waitForResponse(
    (response) =>
      response.request().method() === 'GET' &&
      new URL(response.url()).pathname === '/api/v1/pantry/summary',
  );
  await listLink.click();
  expect((await shoppingEditorReady).ok()).toBe(true);

  const shoppingRow = page.locator('article', {
    has: page.getByLabel('Red lentils quantity'),
  });
  await expect(shoppingRow.getByLabel('Red lentils quantity')).toHaveValue('50');
  const generatedExplanation = shoppingRow.locator('details');
  await generatedExplanation.locator('summary').click();
  await expect(generatedExplanation.getByText(/2027-04-03 · 2 servings · 200 g/u)).toBeVisible();
  await expect(generatedExplanation.getByText(/2027-04-05 · 2 servings · 200 g/u)).toBeVisible();
  const quantityInput = shoppingRow.getByLabel('Red lentils quantity');
  const manualSave = page.waitForResponse(
    (response) => response.request().method() === 'PATCH' && response.url().includes(`/items/`),
  );
  await quantityInput.fill('60');
  await quantityInput.press('Tab');
  expect((await manualSave).ok()).toBe(true);

  for (const mealId of plannedMeals) {
    const response = await page.request.delete(`/api/v1/meal-plan/${mealId}`, {
      headers: { Origin: ORIGIN },
    });
    expect(response.status()).toBe(204);
  }
  const regenerate = await page.request.post('/api/v1/shopping-lists/pantry-shortages', {
    headers: { Origin: ORIGIN },
    data: { weekStart: WEEK_START, weekEnd: WEEK_END, listId },
  });
  expect(regenerate.ok()).toBe(true);
  const reloadedEditorReady = page.waitForResponse(
    (response) =>
      response.request().method() === 'GET' &&
      new URL(response.url()).pathname === '/api/v1/pantry/summary',
  );
  await page.reload();
  expect((await reloadedEditorReady).ok()).toBe(true);
  await expect(shoppingRow.getByLabel('Red lentils quantity')).toHaveValue('60');
  await expect(
    shoppingRow.getByText('Obsolete generated demand · kept as a manual item'),
  ).toBeVisible();
  await expect(shoppingRow.locator('details li')).toHaveCount(0);
  const persistedList = (await (
    await page.request.get(`/api/v1/shopping-lists/${listId}`)
  ).json()) as {
    list: {
      items: Array<{
        id: string;
        item: string;
        quantity: number;
        sourceRecipeIds: string;
        pantry: {
          demandState: string;
          formulaInputs: string;
          provenance: string;
          generatedQuantity: number | null;
          shortageQuantity: number | null;
        };
      }>;
    };
  };
  const persistedItem = persistedList.list.items.find((item) => item.item === 'Red lentils')!;
  expect(persistedItem).toMatchObject({
    quantity: 60,
    sourceRecipeIds: '[]',
    pantry: {
      demandState: 'manual',
      formulaInputs: '{}',
      provenance: '{}',
      generatedQuantity: null,
      shortageQuantity: null,
    },
  });
  await screenshot(page, testInfo, 'grocery-obsolete-manual');

  const checkedSave = page.waitForResponse(
    (response) =>
      response.request().method() === 'PATCH' &&
      response.url().includes(`/items/${persistedItem.id}`),
  );
  await shoppingRow.getByLabel('Mark Red lentils complete').check();
  expect((await checkedSave).ok()).toBe(true);
  const intakeLocation = shoppingRow.getByLabel('Pantry location for Red lentils');
  await expect(intakeLocation.locator('option', { hasText: 'Basement shelf' })).toHaveCount(1);
  await intakeLocation.selectOption({
    label: 'Basement shelf',
  });
  const intakeResponse = page.waitForResponse(
    (response) =>
      response.request().method() === 'POST' && response.url().endsWith('/pantry-intake'),
  );
  await shoppingRow.getByRole('button', { name: 'Add purchased to Pantry' }).click();
  expect((await intakeResponse).status()).toBe(201);
  await expect(shoppingRow.getByRole('status')).toContainText('Added to Pantry.');
  const afterIntake = await pantryDashboard(page);
  const purchasedBatch = afterIntake.dashboard.batches.find(
    (batch) => batch.sourceShoppingListItemId === persistedItem.id,
  );
  expect(purchasedBatch?.quantityRemaining).toBe(60);

  await page.goto(`/recipes/${recipe.id}/cook`);
  await page.getByRole('button', { name: 'Start cooking' }).click();
  await expect(page.getByRole('button', { name: 'Finish cooking' })).toBeVisible();
  await page.getByRole('button', { name: 'Finish cooking' }).click();
  const confirmation = page.getByRole('region', { name: 'Confirm Pantry changes' });
  await expect(confirmation.getByLabel('Deduction 1 quantity')).toHaveValue('200');
  await screenshot(page, testInfo, 'cooking-explicit-confirmation');
  const completionResponse = page.waitForResponse(
    (response) => response.request().method() === 'POST' && response.url().endsWith('/complete'),
  );
  await confirmation.getByRole('button', { name: 'Confirm deductions and finish' }).click();
  expect((await completionResponse).ok()).toBe(true);
  await expect(page.getByRole('status')).toHaveText('Cooking complete and Pantry updated.');

  const afterCooking = await pantryDashboard(page);
  const firstPersisted = afterCooking.dashboard.batches.find(
    (batch) => batch.id === firstBatch!.id,
  );
  const secondPersisted = afterCooking.dashboard.batches.find(
    (batch) => batch.id === secondBatch.id,
  );
  const purchasePersisted = afterCooking.dashboard.batches.find(
    (batch) => batch.id === purchasedBatch!.id,
  );
  expect(firstPersisted).toMatchObject({ quantityRemaining: 0, status: 'depleted' });
  expect(secondPersisted).toMatchObject({ quantityRemaining: 150 });
  expect(purchasePersisted).toMatchObject({ quantityRemaining: 60 });
  const eventsResponse = await page.request.get('/api/v1/pantry/events?limit=100');
  expect(eventsResponse.ok()).toBe(true);
  const { events } = (await eventsResponse.json()) as {
    events: Array<{ batchId: string; reason: string; relatedCookSessionId: string | null }>;
  };
  const cookingEvents = events.filter((event) => event.reason === 'Confirmed cooking deduction');
  expect(cookingEvents.map((event) => event.batchId).sort()).toEqual(
    [firstBatch!.id, secondBatch.id].sort(),
  );
  expect(cookingEvents.every((event) => event.relatedCookSessionId)).toBe(true);

  const preparedResponse = page.waitForResponse(
    (response) =>
      response.request().method() === 'POST' &&
      /\/nutrition\/profiles\/[^/]+\/prepared-recipes$/u.test(new URL(response.url()).pathname),
  );
  await page
    .getByLabel('Ingredients and preparation match the selected Nutrition calculation.')
    .check();
  await page.getByRole('button', { name: 'Create prepared Nutrition batch' }).click();
  expect((await preparedResponse).status()).toBe(201);
  await expect(
    page.getByText('Prepared Nutrition batch saved. Nothing has been marked eaten.', {
      exact: true,
    }),
  ).toBeVisible();
  const session = (await (await page.request.get('/api/v1/nutrition/session')).json()) as {
    actor: { nutritionProfileId: string };
  };
  const prepared = (await (
    await page.request.get(
      `/api/v1/nutrition/profiles/${session.actor.nutritionProfileId}/prepared-recipes`,
    )
  ).json()) as { preparedRecipes: Array<{ id: string }> };
  expect(prepared.preparedRecipes).toHaveLength(1);
  const consumption = await page.request.post(
    `/api/v1/nutrition/profiles/${session.actor.nutritionProfileId}/prepared-recipes/${prepared.preparedRecipes[0]!.id}/consume`,
    {
      headers: { Origin: ORIGIN },
      data: {
        idempotencyKey: 'v1-release-prepared-consumption',
        servingCount: 1,
        occurredAt: '2027-04-03T19:00:00-07:00',
        mealSlot: 'dinner',
        note: 'Explicit v1 release acceptance consumption.',
      },
    },
  );
  expect(consumption.status()).toBe(201);
  await page.goto('/nutrition?view=diary');
  await expect(page.getByRole('heading', { name: /nutrition/u })).toBeVisible();

  await page.setViewportSize({ width: 390, height: 844 });
  await page.goto('/pantry');
  await expect(page.getByRole('heading', { name: 'Pantry', exact: true })).toBeVisible();
  await expect(
    page
      .getByRole('complementary')
      .getByText('Confirmed cooking deduction', { exact: true })
      .filter({ visible: true }),
  ).toHaveCount(2);
  expect(
    await page.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth),
    'persisted mobile Pantry should not horizontally overflow',
  ).toBe(true);
  const finalAxe = await new AxeBuilder({ page }).analyze();
  expect(finalAxe.violations).toEqual([]);
  await screenshot(page, testInfo, 'pantry-mobile-after-cooking');
  expect(browserErrors).toEqual([]);
  expect(externalRequests).toEqual([]);
});
