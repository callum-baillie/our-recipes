import { expect, test, type Page } from '@playwright/test';
import { emptyRecipeInput } from '../../src/lib/domain/recipe';
import { completeInitialOnboarding, TEST_PASSPHRASE } from './helpers/onboarding';
import { appAxe } from './helpers/accessibility';
import { mkdirSync, writeFileSync } from 'node:fs';
import { execFileSync } from 'node:child_process';

async function post(page: Page, path: string, data: unknown) {
  const response = await page.request.post(path, {
    headers: { Origin: 'http://127.0.0.1:3100' },
    data,
  });
  expect(response.ok(), `${path}: ${await response.text()}`).toBe(true);
  return response.json();
}

/** Run against the isolated e2e database; AI, camera and uncertain writes are intercepted. */
test('refinement workflows preserve draft identity, request scope and recovery at short mobile sizes', async ({
  page,
}) => {
  test.setTimeout(240_000);
  const evidenceDirectory = 'screenshots/post-review/retained';
  mkdirSync(evidenceDirectory, { recursive: true });
  await page.goto('/');
  if (new URL(page.url()).pathname === '/sign-in') {
    await page
      .getByLabel('Email', { exact: true })
      .fill('workflow-refinement-fixture-maya@example.test');
    await page.getByLabel('Passphrase', { exact: true }).fill(TEST_PASSPHRASE);
    await page.getByRole('button', { name: 'Sign in', exact: true }).click();
    await page.waitForURL((url) => url.pathname !== '/sign-in');
  } else await completeInitialOnboarding(page, 'Workflow refinement fixture', 'Maya');
  const fixtureSuffix = Date.now();
  const milkName = `Whole milk ${fixtureSuffix}`;
  const product = (
    await post(page, '/api/v1/pantry/products', {
      displayName: milkName,
      defaultInventoryUnit: 'ml',
      stockUnit: 'ml',
      defaultStorageType: 'refrigerator',
      isStaple: true,
      restockMode: 'always_have',
      restockTrigger: 'below_target',
      targetStock: 1000,
      reorderThreshold: 200,
    })
  ).product;
  const location = (
    await post(page, '/api/v1/pantry/locations', {
      name: `Fixture shelf ${fixtureSuffix}`,
      storageType: 'refrigerator',
    })
  ).location;
  await post(page, '/api/v1/pantry/batches', {
    productId: product.id,
    locationId: location.id,
    quantityRemaining: 1500,
    originalQuantity: 1500,
    unit: 'ml',
    status: 'unopened',
  });
  const input = {
    ...emptyRecipeInput,
    title: `Workflow milk soup ${fixtureSuffix}`,
    servings: '4',
    ingredientGroups: [
      {
        name: '',
        ingredients: [
          {
            quantity: '500',
            unit: 'ml',
            item: milkName,
            pantryProductId: product.id,
            shoppingCategory: 'Dairy & eggs',
            note: '',
          },
        ],
      },
    ],
    instructionSections: [{ title: '', steps: ['Heat gently and serve.'] }],
    nutritionCalories: 123,
  };
  const recipe = (await post(page, '/api/v1/recipes', input)).recipe;
  await page.goto(`/recipes/${recipe.id}/edit`);
  const ingredient = page.getByLabel('Ingredient 1-1 item');
  await ingredient.evaluate((element) => {
    const events: unknown[] = [];
    (window as unknown as { ingredientSubmitEvents: unknown[] }).ingredientSubmitEvents = events;
    const form = element.closest('form')!;
    for (const type of ['keydown', 'click', 'submit'])
      form.addEventListener(
        type,
        (event) => {
          const target = event.target as HTMLElement;
          events.push({
            type,
            time: performance.now(),
            target: target.getAttribute('name') ?? target.textContent?.slice(0, 80),
            key: (event as KeyboardEvent).key,
            review: Boolean(form.querySelector('[data-link-review]')),
            submitDisabled: (form.querySelector('button[type="submit"]') as HTMLButtonElement)
              .disabled,
          });
        },
        true,
      );
  });
  await ingredient.fill('Oat drink');
  let recipeWrites = 0;
  let submittedIngredient: unknown;
  await page.route(`**/api/v1/recipes/${recipe.id}`, async (route) => {
    if (route.request().method() === 'PUT') {
      recipeWrites++;
      submittedIngredient = route.request().postDataJSON().ingredientGroups[0].ingredients[0];
      await route.fulfill({
        status: 409,
        json: { error: { message: 'Controlled version conflict' } },
      });
    } else await route.continue();
  });
  await ingredient.press('Enter');
  await expect(
    page.getByText(/Review the changed ingredient food links before saving/),
  ).toBeVisible();
  expect(recipeWrites).toBe(0);
  const keepLink = page.getByRole('button', { name: 'Keep food link', exact: true });
  try {
    await keepLink.click();
    // Confirm the reviewed UI state before submitting again, rather than assuming click
    // completion has also committed the acknowledgement and finished the earlier submit.
    await expect(keepLink).toHaveCount(0);
    await expect(
      page.locator('.editor-save-bar').getByRole('button', { name: 'Save changes' }),
    ).toBeEnabled();
    await ingredient.press('Enter');
    await expect
      .poll(() => recipeWrites, 'One PUT after explicit link review and native Enter')
      .toBe(1);
    expect(submittedIngredient).toMatchObject({ item: 'Oat drink', pantryProductId: product.id });
    await expect(
      page.getByText('Controlled version conflict', { exact: true }).first(),
    ).toBeVisible();
  } catch (error) {
    const diagnostics = await ingredient.evaluate((element) => ({
      events: (window as unknown as { ingredientSubmitEvents: unknown[] }).ingredientSubmitEvents,
      value: (element as HTMLInputElement).value,
      alerts: [...element.closest('form')!.querySelectorAll('[role="alert"]')].map(
        (item) => item.textContent,
      ),
      pending: (
        element.closest('form')!.querySelector('button[type="submit"]') as HTMLButtonElement
      ).disabled,
    }));
    await test.info().attach('ingredient-submit-state', {
      body: JSON.stringify({ recipeWrites, submittedIngredient, ...diagnostics }, null, 2),
      contentType: 'application/json',
    });
    console.log('INGREDIENT_SUBMIT_DIAGNOSTICS', JSON.stringify({ recipeWrites, ...diagnostics }));
    throw error;
  }
  expect(recipeWrites).toBe(1);

  let release!: () => void;
  const gate = new Promise<void>((resolve) => {
    release = resolve;
  });
  await page.route(`**/api/v1/recipes/${recipe.id}/improve`, async (route) => {
    await gate;
    await route.fulfill({
      json: {
        candidate: {
          recipe: {
            ...input,
            instructionSections: [
              {
                title: 'Long method',
                steps: Array.from(
                  { length: 80 },
                  (_, i) =>
                    `Step ${i + 1}: gently cook the soup, preserving its texture and flavour. This lengthy fixture checks native modal scrolling.`,
                ),
              },
            ],
          },
        },
      },
    });
  });
  await page.getByRole('button', { name: 'AI Improve', exact: true }).click();
  await page.getByLabel('Recipe name').fill('Edits made while waiting');
  release();
  const review = page.getByRole('dialog', { name: 'Review AI improvement' });
  await expect(review).toBeVisible();
  for (const viewport of [
    { width: 1440, height: 1000 },
    { width: 390, height: 500 },
    { width: 320, height: 500 },
  ]) {
    await page.setViewportSize(viewport);
    await expect(review).toBeVisible();
    const geometry = await review.evaluate((node) => ({
      scroll: node.scrollHeight,
      height: node.clientHeight,
      overflow: getComputedStyle(node).overflowY,
    }));
    expect(geometry.scroll).toBeGreaterThan(geometry.height);
    expect(geometry.overflow).toBe('auto');
    const apply = review.getByRole('button', { name: 'Apply draft' });
    await apply.focus();
    await expect(apply).toBeInViewport();
    await page.keyboard.press('Shift+Tab');
    await expect(review.getByRole('button', { name: 'Keep current edits' })).toBeFocused();
    await page.screenshot({
      path: `${evidenceDirectory}/ai-review-${viewport.width}x${viewport.height}.png`,
    });
  }
  expect((await appAxe(page).include('dialog').analyze()).violations).toEqual([]);
  await review.getByRole('button', { name: 'Keep current edits' }).click();
  await expect(page.getByLabel('Recipe name')).toHaveValue('Edits made while waiting');

  // Native navigation intentionally leaves this synthetic draft; no paid request was dispatched.
  page.on('dialog', (dialog) => dialog.accept());
  await page.goto(`/recipes/${recipe.id}/cook`);
  let finishStart!: () => void;
  const startGate = new Promise<void>((resolve) => {
    finishStart = resolve;
  });
  let submitted = 0;
  await page.route('**/api/v1/cook-sessions', async (route) => {
    submitted = route.request().postDataJSON().targetServings;
    await startGate;
    await route.fulfill({
      json: {
        session: { id: 'controlled-session', targetServings: submitted },
        pantry: { recommendedConsumptions: [] },
      },
    });
  });
  await page.getByRole('button', { name: 'Start cooking' }).click();
  await expect(page.getByLabel(/Cook for/)).toBeDisabled();
  finishStart();
  await expect(
    page.getByText('Cooking session for 4 servings. Batch size is fixed for this session.'),
  ).toBeVisible();
  expect(submitted).toBe(4);
  await page.getByText('Temperature converter', { exact: true }).click();
  await expect(page.getByLabel('Temperature to convert')).toBeVisible();
  await expect(page.getByLabel('From unit')).toBeVisible();
  await page.screenshot({
    path: `${evidenceDirectory}/cooking-count-and-converter.png`,
    fullPage: true,
  });

  await page.goto('/pantry');
  await page.getByRole('button', { name: 'Essentials', exact: true }).click();
  await page
    .getByRole('searchbox', { name: 'Search Pantry', exact: true })
    .fill('No matching display batches');
  const essential = page
    .locator('article')
    .filter({ has: page.getByRole('heading', { name: milkName, exact: true }) });
  await expect(essential.getByText('1500 ml', { exact: true })).toBeVisible();
  await expect(essential.getByText('At target', { exact: true })).toBeVisible();
  await essential.getByText('Quick edit', { exact: true }).click();
  let summaryReadsFail = false;
  await page.route('**/api/v1/pantry/summary?**', async (route) => {
    if (summaryReadsFail)
      await route.fulfill({
        status: 503,
        json: { error: { message: 'Controlled summary outage' } },
      });
    else await route.continue();
  });
  await page.route(`**/api/v1/pantry/products/${product.id}`, async (route) => {
    summaryReadsFail = true;
    await route.fulfill({ json: { product } });
  });
  await essential.getByRole('button', { name: 'Save policy' }).click();
  await expect(page.getByText(/The stock change was saved/)).toBeVisible();
  await expect(essential.getByRole('button', { name: 'Save policy' })).toBeDisabled();
  await page.screenshot({
    path: `${evidenceDirectory}/pantry-acknowledged-refresh-failure.png`,
    fullPage: true,
  });
  summaryReadsFail = false;
  await page.getByRole('button', { name: 'Refresh Pantry' }).click();
  await expect(essential.getByRole('button', { name: 'Save policy' })).toBeEnabled();

  const list = (
    await post(page, '/api/v1/shopping-lists', {
      kind: 'manual',
      name: 'Workflow shopping',
      makeAutomaticRestockTarget: false,
    })
  ).list;
  await page.goto(`/lists/${list.id}`);
  await page.locator('summary[aria-label="More list options"]').click();
  const listName = page.getByLabel('List name', { exact: true });
  await listName.fill('   ');
  await listName.press('Enter');
  await expect(page.getByText('Enter a list name.', { exact: true })).toBeVisible();
  let finishRename!: () => void;
  const renameGate = new Promise<void>((resolve) => {
    finishRename = resolve;
  });
  await page.route(`**/api/v1/shopping-lists/${list.id}`, async (route) => {
    if (route.request().method() !== 'PATCH') {
      await route.continue();
      return;
    }
    await renameGate;
    await route.fulfill({ status: 409, json: { error: { message: 'Controlled list conflict' } } });
  });
  await listName.fill('Weekend draft');
  await listName.press('Enter');
  await expect(listName).toBeDisabled();
  finishRename();
  await expect(page.getByText('Controlled list conflict', { exact: true })).toBeVisible();
  await expect(listName).toHaveValue('Weekend draft');
  await page.screenshot({ path: `${evidenceDirectory}/mobile-list-name-error.png` });

  await page.goto('/planner?view=day&date=2026-10-19');
  await page
    .getByRole('button', { name: /^Add a meal/ })
    .first()
    .click();
  const picker = page.getByRole('dialog', { name: /Add meals/ });
  await expect(picker).toBeVisible();
  await picker.getByRole('button', { name: new RegExp(`${input.title}.*Select`) }).click();
  let additions = 0;
  await page.route('**/api/v1/meal-plan/batch', async (route) => {
    additions++;
    await route.abort('failed');
  });
  await picker.getByRole('button', { name: 'Add 1 meal' }).click();
  await expect(
    picker.getByText(/We could not confirm whether these meals were added/),
  ).toBeVisible();
  await picker.getByRole('button', { name: 'Clear selections' }).click();
  await picker.getByRole('button', { name: new RegExp(`${input.title}.*Select`) }).click();
  await expect(picker.getByRole('button', { name: 'Add 1 meal' })).toBeDisabled();
  expect(additions).toBe(1);
  await page.screenshot({ path: `${evidenceDirectory}/uncertain-meal-selection-retained.png` });
  await page.goto(`/recipes/${recipe.id}`);
  await page.locator('summary').filter({ hasText: 'Recipe-source nutrition' }).click();
  await expect(
    page.getByRole('button', { name: 'Estimate replacement nutrition', exact: true }),
  ).toBeVisible();
  await expect(page.getByRole('button', { name: 'Update estimate', exact: true })).toHaveCount(0);
  await page.setViewportSize({ width: 390, height: 844 });
  await page
    .getByRole('button', { name: 'Estimate replacement nutrition', exact: true })
    .scrollIntoViewIfNeeded();
  await page.screenshot({ path: `${evidenceDirectory}/source-nutrition-neutral-action.png` });
  await page.route('**/api/v1/meal-plan/export/pdf', (route) =>
    route.fulfill({
      status: 503,
      json: {
        error: { message: 'Controlled export outage; this fixture verifies option scope only.' },
      },
    }),
  );
  await page.goto('/print?kind=meal-plan&start=2026-10-19&end=2026-10-25');
  await expect(
    page.getByText(/Cards use each meal’s planned recipe version, adaptations and servings/),
  ).toBeVisible();
  await page.getByLabel('Append recipe cards to the schedule').scrollIntoViewIfNeeded();
  await page.screenshot({ path: `${evidenceDirectory}/meal-plan-print-card-scope-390.png` });
  await page.setViewportSize({ width: 1440, height: 1000 });
  await page.getByLabel('Append recipe cards to the schedule').scrollIntoViewIfNeeded();
  await page.screenshot({ path: `${evidenceDirectory}/meal-plan-print-card-scope-1440.png` });
  writeFileSync(
    `${evidenceDirectory}/manifest.json`,
    JSON.stringify(
      {
        revision: execFileSync('git', ['rev-parse', 'HEAD'], { encoding: 'utf8' }).trim(),
        capturedAt: new Date().toISOString(),
        state:
          'Synthetic household; real Chromium with controlled AI, uncertain-write and export responses. No paid or live camera calls.',
        viewports: ['1440x1000', '390x500', '320x500', '390x844'],
      },
      null,
      2,
    ),
  );
});

test('unknown buy quantity retains separate recipe demand in the populated editor', async ({
  page,
}) => {
  test.setTimeout(90_000);
  const signedIn = await page.request.post('/api/auth/sign-in/email', {
    headers: { Origin: 'http://127.0.0.1:3100' },
    data: { email: 'workflow-refinement-fixture-maya@example.test', password: TEST_PASSPHRASE },
  });
  expect(signedIn.ok()).toBe(true);
  const { list } = await post(page, '/api/v1/shopping-lists', {
    kind: 'manual',
    name: `Unknown purchase fixture ${Date.now()}`,
  });
  await post(page, `/api/v1/shopping-lists/${list.id}/items`, {
    item: 'Fixture potatoes',
    quantity: '',
    unit: 'g',
    note: '',
    checked: false,
  });
  const saved = await (await page.request.get(`/api/v1/shopping-lists/${list.id}`)).json();
  // Controlled GET projection: recipe demand is known while the purchase amount is unknown.
  const projected = {
    ...saved,
    list: {
      ...saved.list,
      items: saved.list.items.map((item: { pantry: object | null }) => ({
        ...item,
        pantry: {
          ...item.pantry,
          demandState: 'uncertain',
          formulaInputs: JSON.stringify({ recipeRequirement: 333, unit: 'g' }),
          generatedUnit: 'g',
          manualQuantityOverride: false,
        },
      })),
    },
  };
  await page.route(`**/api/v1/shopping-lists/${list.id}`, (route) =>
    route.request().method() === 'GET' ? route.fulfill({ json: projected }) : route.continue(),
  );
  await page.goto(`/lists/${list.id}`);
  await page.getByRole('button', { name: 'Manage list', exact: true }).click();
  await page.evaluate(() => window.dispatchEvent(new Event('focus')));
  await expect(page.getByRole('article')).toContainText('333 g recipe demand');
  await page.getByRole('button', { name: 'Edit Fixture potatoes', exact: true }).click();
  const editor = page.getByRole('dialog', { name: 'Edit item', exact: true });
  await expect(editor.getByText(/Planned recipe demand: 333 g/)).toBeVisible();
  await expect(editor.getByLabel('To buy quantity', { exact: true })).toHaveValue('');
  mkdirSync('screenshots/full-refinement/workflow', { recursive: true });
  for (const width of [1440, 390]) {
    await page.setViewportSize({ width, height: width === 1440 ? 1000 : 844 });
    await editor.getByLabel('To buy quantity', { exact: true }).focus();
    await page.screenshot({
      path: `screenshots/full-refinement/workflow/unknown-buy-recipe-demand-${width}.png`,
    });
    expect((await appAxe(page).include('dialog[open]').analyze()).violations).toEqual([]);
  }
  await editor.getByRole('button', { name: 'Cancel', exact: true }).click();
  expect(
    (await (await page.request.get(`/api/v1/shopping-lists/${list.id}`)).json()).list.items[0]
      .quantity,
  ).toBeNull();
});
