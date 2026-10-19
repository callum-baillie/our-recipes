import { expect, test } from '@playwright/test';
import { completeInitialOnboarding } from './helpers/onboarding';
import { appAxe } from './helpers/accessibility';

const origin = 'http://127.0.0.1:3100';

test('recipe toolbar and reviewed AI enhancements work across mobile and desktop', async ({
  page,
}) => {
  test.setTimeout(180_000);
  const errors: string[] = [];
  page.on('pageerror', (error) => errors.push(error.message));
  await page.setViewportSize({ width: 390, height: 844 });
  await completeInitialOnboarding(page, 'Recipe enhancement kitchen', 'Maya');
  const original = {
    title: 'Tomato soup',
    summary: 'A simple family soup.',
    servings: '4',
    prepMinutes: 5,
    cookMinutes: 20,
    sourceName: 'Family notebook',
    sourceUrl: '',
    sharedNotes: 'Keep these notes.',
    tags: ['family'],
    ingredientGroups: [
      {
        name: '',
        ingredients: [
          {
            quantity: 2,
            unit: 'cups',
            item: 'large tomatoes',
            note: '',
            shoppingCategory: 'Fresh produce',
          },
        ],
      },
    ],
    instructionSections: [{ title: '', steps: ['Simmer.'] }],
  };
  const created = await page.request.post('/api/v1/recipes', {
    headers: { Origin: origin },
    data: original,
  });
  expect(created.status()).toBe(201);
  const { recipe } = await created.json();
  await page.goto(`/recipes/${recipe.id}`);
  await expect(page.getByRole('heading', { name: original.title, exact: true })).toBeVisible();
  const toolbar = page.getByRole('toolbar', { name: 'Recipe actions' });
  await expect(toolbar.getByRole('link', { name: 'Cook this recipe' })).toHaveAttribute(
    'href',
    `/recipes/${recipe.id}/cook`,
  );
  await expect(toolbar.getByRole('link', { name: 'Edit recipe' })).toHaveAttribute(
    'href',
    `/recipes/${recipe.id}/edit`,
  );
  await expect(toolbar.getByRole('link', { name: 'Export / print' })).toHaveAttribute(
    'href',
    `/print?kind=recipes&recipes=${recipe.id}`,
  );
  for (const width of [320, 390, 1440]) {
    await page.setViewportSize({ width, height: 900 });
    expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(
      true,
    );
    const box = await toolbar.boundingBox();
    const controls = await toolbar.locator(':scope > a, :scope > button').all();
    expect(controls.length).toBe(5);
    for (const control of controls) {
      const controlBox = (await control.boundingBox())!;
      expect(controlBox.height).toBeGreaterThanOrEqual(44);
      if (width < 650) {
        expect(controlBox.width).toBeGreaterThanOrEqual(44);
        expect(controlBox.y).toBeCloseTo((await controls[0].boundingBox())!.y, 1);
        await expect(control.locator('.recipe-toolbar-label')).toBeHidden();
      } else await expect(control.locator('.recipe-toolbar-label')).toBeVisible();
    }
    expect(box!.y).toBeGreaterThan((await page.locator('h1').boundingBox())!.y);
    await page.screenshot({ path: `/tmp/bord-recipe-toolbar-${width}.png` });
  }
  await toolbar.getByRole('button', { name: 'Like this recipe' }).click();
  await expect(toolbar.getByRole('button', { name: 'Remove favorite' })).toHaveAttribute(
    'aria-pressed',
    'true',
  );
  await page.reload();
  await expect(toolbar.getByRole('button', { name: 'Remove favorite' })).toHaveAttribute(
    'aria-pressed',
    'true',
  );
  await toolbar.getByRole('link', { name: 'Cook this recipe' }).focus();
  await page.keyboard.press('ArrowRight');
  await expect(toolbar.getByRole('button', { name: 'Remove favorite' })).toBeFocused();

  let generations = 0;
  let release!: () => void;
  const held = new Promise<void>((resolve) => {
    release = resolve;
  });
  await page.route('**/api/v1/ai/status', (route) =>
    route.fulfill({ json: { status: { enabled: true, message: 'Ready' } } }),
  );
  await page.route(`**/api/v1/recipes/${recipe.id}/improve`, async (route) => {
    generations++;
    const request = route.request().postDataJSON();
    expect(request).toMatchObject({ confirm: true, mode: 'enhance', expectedRevision: 1 });
    await held;
    await route.fulfill({
      status: 201,
      json: {
        candidate: {
          recipe: {
            ...request.recipe,
            servings: '6',
            prepMinutes: 10,
            nutritionCalories: 125,
            category: 'Soup',
            tags: ['soup', 'family'],
            ingredientGroups: [
              {
                name: '',
                ingredients: [
                  { ...request.recipe.ingredientGroups[0].ingredients[0], unit: 'cup' },
                ],
              },
            ],
            instructionSections: [
              { title: 'Cook', steps: ['Simmer until the tomatoes are tender.'] },
            ],
          },
          confidence: 0.8,
          warnings: ['Nutrition is estimated per serving.'],
          uncertainSegments: [
            { field: 'Servings', rawText: '6', reason: 'Inferred from ingredients.' },
          ],
        },
      },
    });
  });
  await toolbar.getByRole('button', { name: 'AI enhance', exact: true }).click();
  const dialog = page.getByRole('dialog', { name: 'Enhance this recipe' });
  await expect(dialog).toBeVisible();
  await expect(dialog.getByRole('button', { name: 'Enhance recipe', exact: true })).toBeDisabled();
  expect(generations).toBe(0);
  await dialog.getByLabel('Allow one paid AI enhancement request').check();
  await dialog.getByRole('button', { name: 'Enhance recipe', exact: true }).click();
  await expect(
    dialog.getByRole('status', { name: 'Enhancing recipe and preparing your comparison' }),
  ).toBeVisible();
  await expect(dialog.getByRole('button', { name: 'Close enhancement' })).toBeDisabled();
  release();
  await expect(dialog.getByRole('heading', { name: '7 of 7 changes selected' })).toBeVisible();
  expect(generations).toBe(1);
  await dialog.getByText('2 review notes', { exact: true }).click();
  await expect(dialog.getByRole('region', { name: 'Uncertain recipe information' })).toContainText(
    'Inferred from ingredients.',
  );
  await dialog.getByText('2 review notes', { exact: true }).click();
  await dialog.getByLabel('Servings', { exact: true }).uncheck();
  await expect(dialog.getByLabel('Calories per serving (kcal)', { exact: true })).not.toBeChecked();
  await expect(dialog.getByLabel('Calories per serving (kcal)', { exact: true })).toBeDisabled();
  for (const width of [320, 390, 1440]) {
    await page.setViewportSize({ width, height: 844 });
    for (const theme of ['light', 'dark']) {
      await page.evaluate((value) => {
        document.documentElement.dataset.theme = value;
        document.documentElement.style.colorScheme = value;
      }, theme);
      await page.screenshot({ path: `/tmp/bord-enhancement-${width}-${theme}.png` });
      await expect
        .poll(async () => (await dialog.boundingBox())!.y + (await dialog.boundingBox())!.height)
        .toBeLessThanOrEqual(844);
      const bounds = (await dialog.boundingBox())!;
      expect(bounds.x).toBeGreaterThanOrEqual(0);
      expect(bounds.x + bounds.width).toBeLessThanOrEqual(width);
      expect(bounds.y + bounds.height).toBeLessThanOrEqual(844);
      expect(await dialog.evaluate((element) => element.scrollWidth <= element.clientWidth)).toBe(
        true,
      );
      expect((await appAxe(page).analyze()).violations).toEqual([]);
      await page.screenshot({ path: `/tmp/bord-enhancement-${width}-${theme}.png` });
    }
  }
  await page.setViewportSize({ width: 390, height: 844 });
  // A failed save retains the complete review and the user's selection.
  await page.route(`**/api/v1/recipes/${recipe.id}`, (route) =>
    route.request().method() === 'PUT'
      ? route.fulfill({
          status: 409,
          json: { error: { message: 'This recipe changed. Refresh before saving.' } },
        })
      : route.continue(),
  );
  await dialog.getByRole('button', { name: 'Save selected changes' }).click();
  await expect(dialog.getByRole('alert')).toContainText('This recipe changed.');
  await expect(dialog.getByLabel('Servings', { exact: true })).not.toBeChecked();
  await page.unroute(`**/api/v1/recipes/${recipe.id}`);
  await dialog.getByRole('button', { name: 'Save selected changes' }).click();
  await expect(dialog).not.toBeVisible();
  await expect(page.locator('.recipe-revision-badge')).toHaveText('Revision 2');
  const saved = (await (await page.request.get(`/api/v1/recipes/${recipe.id}`)).json()).recipe;
  expect(saved.servings).toBe('4');
  expect(saved.prepMinutes).toBe(10);
  expect(saved.ingredientGroups[0].ingredients[0].unit).toBe('cup');
  expect(saved.instructionSections[0].steps[0].body).toBe('Simmer until the tomatoes are tender.');
  expect(saved.sourceName).toBe(original.sourceName);
  expect(saved.sharedNotes).toBe(original.sharedNotes);
  await toolbar.getByRole('button', { name: 'AI enhance', exact: true }).click();
  await expect(dialog.getByLabel('Allow one paid AI enhancement request')).not.toBeChecked();
  await dialog.getByRole('button', { name: 'Close enhancement' }).click();
  await expect(toolbar.getByRole('button', { name: 'AI enhance', exact: true })).toBeFocused();
  expect(errors).toEqual([]);
});
