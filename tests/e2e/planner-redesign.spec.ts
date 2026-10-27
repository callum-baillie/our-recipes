import { expect, test } from '@playwright/test';

import { completeInitialOnboarding, completeProfileOnboarding } from './helpers/onboarding';

const recipePayload = (title: string, category: string, item: string) => ({
  title,
  summary: `${title} for the household table.`,
  status: 'active',
  servings: '1 serving',
  prepMinutes: 10,
  cookMinutes: 20,
  restMinutes: 0,
  difficulty: '',
  cuisine: '',
  category,
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
  tags: [category.toLocaleLowerCase()],
  ingredientGroups: [{ name: '', ingredients: [{ quantity: 100, unit: 'g', item, note: '' }] }],
  instructionSections: [{ title: '', steps: [`Cook the ${item}.`] }],
});

test('planner assigns recipes by selected meal and scales the shopping list to diners', async ({
  page,
}) => {
  test.setTimeout(180_000);
  await completeInitialOnboarding(page, 'Planner test kitchen', 'Callum');

  await page.goto('/settings/profiles');
  await page.getByRole('button', { name: 'Add profile', exact: true }).click();
  const profileOnboarding = page.getByRole('dialog', { name: 'New profile onboarding' });
  await completeProfileOnboarding(profileOnboarding, {
    displayName: 'Julia',
    email: 'julia-planner@example.test',
  });

  let pastaIngredientId = '';
  for (const payload of [
    recipePayload('Dinner pasta', 'Dinner', 'pasta'),
    recipePayload('Berry crumble', 'Dessert', 'berries'),
  ]) {
    const response = await page.request.post('/api/v1/recipes', {
      headers: { Origin: 'http://127.0.0.1:3100' },
      data: payload,
    });
    expect(response.ok()).toBe(true);
    const created = (await response.json()) as {
      recipe: { ingredientGroups: Array<{ ingredients: Array<{ id: string }> }> };
    };
    if (payload.title === 'Dinner pasta') {
      pastaIngredientId = created.recipe.ingredientGroups[0]!.ingredients[0]!.id;
    }
  }
  const pastaProductResponse = await page.request.post('/api/v1/pantry/products', {
    headers: { Origin: 'http://127.0.0.1:3100' },
    data: {
      displayName: 'Pasta',
      defaultInventoryUnit: 'g',
      defaultStorageType: 'pantry',
    },
  });
  expect(pastaProductResponse.status()).toBe(201);
  const pastaProduct = (await pastaProductResponse.json()) as { product: { id: string } };
  const mappingResponse = await page.request.put(`/api/v1/pantry/mappings/${pastaIngredientId}`, {
    headers: { Origin: 'http://127.0.0.1:3100' },
    data: { productId: pastaProduct.product.id, compatibleVariant: false, isOptional: false },
  });
  expect(mappingResponse.ok()).toBe(true);

  await page.setViewportSize({ width: 390, height: 844 });
  await page.goto('/planner');
  expect(
    await page.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth),
    'mobile planner should not horizontally overflow',
  ).toBe(true);
  await expect(page.locator('.app-footer')).toBeVisible();
  await page.getByRole('button', { name: 'Generate meal plan' }).click();
  const generator = page.getByRole('dialog', { name: 'Generate your meal plan' });
  await expect(
    generator.getByRole('button', { name: /Use saved recipes.*Prepare/u }),
  ).toHaveAttribute('aria-pressed', 'true');
  await generator
    .getByRole('button', { name: /Create new recipes with AI.*Paid generation/u })
    .click();
  await expect(
    generator.getByRole('heading', { name: 'Create new recipes with AI' }),
  ).toBeVisible();
  await generator.getByText('Cost details', { exact: true }).click();
  await expect(generator.getByLabel('Estimated AI API cost')).toContainText('Input');
  await expect(generator.getByLabel('Estimated AI API cost')).toContainText('Output');
  await expect(generator.getByRole('switch', { name: /Generate recipe images/u })).toHaveCount(0);
  await expect(
    generator.getByText(/Recipe images are a separate optional paid request/),
  ).toBeVisible();
  expect(
    await generator.evaluate((element) => element.scrollWidth <= element.clientWidth),
    'mobile generator should not horizontally overflow',
  ).toBe(true);
  await generator.getByRole('button', { name: 'Close meal plan generator' }).click();
  await page.getByRole('button', { name: 'Plan settings' }).click();
  const setup = page.getByRole('dialog', { name: 'Plan settings', exact: true });
  await expect(setup.getByRole('checkbox', { name: 'Callum' })).toBeChecked();
  await expect(setup.getByRole('checkbox', { name: 'Julia' })).toBeChecked();
  await setup.getByText('Breakfast', { exact: true }).filter({ visible: true }).click();
  await setup.getByText('Lunch', { exact: true }).filter({ visible: true }).click();
  await setup.getByText('Dessert', { exact: true }).filter({ visible: true }).click();
  await expect(setup.getByRole('checkbox', { name: 'Breakfast' })).not.toBeChecked();
  await expect(setup.getByRole('checkbox', { name: 'Lunch' })).not.toBeChecked();
  await expect(setup.getByRole('checkbox', { name: 'Dessert' })).toBeChecked();
  await setup.getByRole('button', { name: 'Close plan settings' }).click();
  await page
    .locator('[class*="mobileSchedule"]')
    .getByRole('button', { name: 'Add meal', exact: true })
    .first()
    .click();

  const selector = page.getByRole('dialog', { name: 'Add meals' });
  await expect(selector).toBeVisible();
  const dinnerTab = selector.getByRole('button', { name: 'Dinner 0 of 1' });
  await expect(dinnerTab).toBeVisible();
  await expect(selector.getByRole('button', { name: 'Dessert 0 of 1' })).toBeVisible();
  await expect(selector.getByRole('button', { name: 'Breakfast 0 of 1' })).toBeVisible();
  await dinnerTab.click();
  await selector.getByPlaceholder('Search recipes').fill('Dinner pasta');
  await selector.getByRole('button', { name: /Dinner pasta.*Select/u }).click();
  await selector.getByRole('button', { name: 'Add 1 meal' }).click();

  await expect(selector).toBeHidden();
  await expect(page.getByText('1 recipe was added to your plan.')).toBeVisible();
  const plannedDinner = page.locator('[class*="mobileSchedule"] article', {
    hasText: 'Dinner pasta',
  });
  await expect(plannedDinner.getByLabel('Servings for Dinner pasta')).toHaveValue('2');

  await page.setViewportSize({ width: 1280, height: 900 });
  await page.getByRole('button', { name: 'Make grocery list' }).click();
  await expect(
    page.getByRole('heading', { name: /^Meal Plan \d{2}\/\d{2} - \d{2}\/\d{2}$/u }),
  ).toBeVisible();
  await page.getByRole('button', { name: 'Manage list', exact: true }).click();
  await page.getByRole('button', { name: 'Edit Pasta', exact: true }).click();
  await expect(
    page
      .getByRole('dialog', { name: 'Edit item', exact: true })
      .getByLabel('To buy quantity', { exact: true }),
  ).toHaveValue('200');
  await page.getByRole('button', { name: 'Close item editor' }).click();

  await page.goto('/settings/ai');
  const modelPane = page
    .getByRole('heading', { name: 'Models by task', exact: true })
    .locator('xpath=ancestor::section[1]');
  const imageTask = modelPane
    .locator('details')
    .filter({ has: page.locator('summary', { hasText: /^Image generation/ }) });
  await imageTask.locator('summary').click();
  const globalImageGeneration = imageTask.getByRole('switch', { name: 'Enable task', exact: true });
  await expect(globalImageGeneration).toBeChecked();
  await globalImageGeneration.uncheck();
  await page.getByRole('button', { name: 'Save global AI settings' }).click();
  await expect(
    page.getByText('AI settings saved. New requests will use these choices.'),
  ).toBeVisible();
  await page.reload();
  await imageTask.locator('summary').click();
  await expect(
    imageTask.getByRole('switch', { name: 'Enable task', exact: true }),
  ).not.toBeChecked();
});
