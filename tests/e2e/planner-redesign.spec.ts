import { expect, test } from '@playwright/test';

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
  await page.goto('/');
  await page.getByLabel('Kitchen name').fill('Planner test kitchen');
  await page.getByRole('button', { name: 'Continue' }).click();
  await page.getByRole('button', { name: 'Continue' }).click();
  await page.getByLabel('Display name').fill('Callum');
  await page.getByRole('button', { name: 'Continue' }).click();
  await page.getByRole('button', { name: 'Continue' }).click();
  await page.getByRole('button', { name: 'Continue' }).click();
  await page.getByRole('button', { name: 'Open the cookbook' }).click();

  await page.goto('/settings/profiles');
  await page.getByRole('button', { name: 'Add another profile' }).click();
  const profileOnboarding = page.getByRole('dialog', { name: 'New profile onboarding' });
  await profileOnboarding.getByLabel('Display name').fill('Julia');
  await profileOnboarding.getByRole('button', { name: 'Continue' }).click();
  await profileOnboarding.getByRole('button', { name: 'Continue' }).click();
  await profileOnboarding.getByRole('button', { name: 'Continue' }).click();
  await profileOnboarding.getByRole('button', { name: 'Create profile' }).click();

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
  await expect(generator.getByRole('heading', { name: 'Plan from recipebook' })).toBeVisible();
  await expect(generator.getByRole('heading', { name: 'Create a plan with AI' })).toBeVisible();
  await expect(generator.getByLabel('Estimated AI API cost')).toContainText('Input');
  await expect(generator.getByLabel('Estimated AI API cost')).toContainText('Output');
  const imageGeneration = generator.getByRole('switch', { name: /Generate recipe images/u });
  await expect(imageGeneration).not.toBeChecked();
  await imageGeneration.check();
  await expect(generator.getByLabel('Estimated AI API cost')).toContainText('images');
  expect(
    await generator.evaluate((element) => element.scrollWidth <= element.clientWidth),
    'mobile generator should not horizontally overflow',
  ).toBe(true);
  await generator.getByRole('button', { name: 'Close meal plan generator' }).click();
  await page.getByRole('button', { name: 'Plan settings' }).click();
  const setup = page.getByRole('region', { name: 'Build your meal plan' });
  await expect(setup.getByText('2 people · 2 servings per meal')).toBeVisible();
  await setup.getByText('Breakfast', { exact: true }).click();
  await setup.getByText('Lunch', { exact: true }).click();
  await setup.getByText('Dessert', { exact: true }).click();
  await setup.getByRole('button', { name: 'Close plan settings' }).click();
  await page
    .locator('[class*="mobileSchedule"]')
    .getByRole('button', { name: 'Add recipe' })
    .first()
    .click();

  const selector = page.getByRole('dialog', { name: 'Select recipes' });
  await expect(selector).toBeVisible();
  await expect(selector.getByRole('tab', { name: 'Dinner 0 of 7' })).toBeVisible();
  await expect(selector.getByRole('tab', { name: 'Dessert 0 of 7' })).toBeVisible();
  await expect(selector.getByRole('tab', { name: /Breakfast/u })).toHaveCount(0);
  await selector
    .getByPlaceholder('Search recipes, tags, categories, or collections')
    .fill('Dinner pasta');
  await selector
    .locator('article', { hasText: 'Dinner pasta' })
    .getByRole('button', { name: 'Select' })
    .click();
  await selector.getByRole('button', { name: 'Add 1 recipe to plan' }).click();

  await expect(selector).toBeHidden();
  await expect(page.getByText('1 recipe was added to your plan.')).toBeVisible();
  const plannedDinner = page.locator('[class*="mobileSchedule"] article', {
    hasText: 'Dinner pasta',
  });
  await expect(plannedDinner.getByLabel('Servings for Dinner pasta')).toHaveValue('2');

  await page.getByRole('button', { name: 'Make Pantry-aware grocery list' }).click();
  await expect(page.getByRole('heading', { name: /^Pantry shortages · /u })).toBeVisible();
  await expect(page.getByLabel('pasta quantity')).toHaveValue('200');

  await page.goto('/settings/ai');
  const globalImageGeneration = page.getByRole('switch', {
    name: /AI generate recipe images/u,
  });
  await expect(globalImageGeneration).toBeChecked();
  await globalImageGeneration.uncheck();
  await page.getByRole('button', { name: 'Save AI settings' }).click();
  await expect(
    page.getByText('Saved. New privacy choices apply to future AI requests.'),
  ).toBeVisible();
  await page.reload();
  await expect(page.getByRole('switch', { name: /AI generate recipe images/u })).not.toBeChecked();
});
