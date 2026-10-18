import { test, expect } from '@playwright/test';
import { completeInitialOnboarding } from './helpers/onboarding';

test('mobile planning, cooking, shopping, and assistant controls stay usable', async ({ page }) => {
  test.setTimeout(120_000);
  const errors: string[] = [];
  page.on('pageerror', (error) => errors.push(error.message));
  await page.setViewportSize({ width: 390, height: 844 });
  await completeInitialOnboarding(page, 'Mobile refinements', 'Alex');
  const recipeId = new URL(page.url()).pathname.split('/')[2]!;
  const mutationHeaders = { origin: 'http://127.0.0.1:3100' };
  const plannedFor = new Date().toISOString().slice(0, 10);
  const mealResponse = await page.request.post('/api/v1/meal-plan', {
    headers: mutationHeaders,
    data: {
      plannedFor,
      meal: 'dinner',
      kind: 'recipe',
      recipeId,
      title: '',
      servings: 2,
      note: '',
    },
  });
  expect(mealResponse.ok()).toBeTruthy();
  await page.goto(`/planner?view=day&date=${plannedFor}`);
  const actions = page
    .getByLabel('Actions for Traditional Scottish Stovies')
    .filter({ visible: true });
  await expect(actions).toBeVisible();
  const menuBox = await actions.boundingBox();
  expect(menuBox!.x + menuBox!.width).toBeLessThanOrEqual(390);
  expect(menuBox!.width).toBeGreaterThanOrEqual(44);
  await actions.click();
  await expect(
    page
      .getByLabel('Move Traditional Scottish Stovies to another day or meal')
      .filter({ visible: true }),
  ).toBeVisible();
  await page.screenshot({ path: '/tmp/bord-mobile-planner.png', fullPage: true });
  await page.getByRole('button', { name: 'Close meal actions' }).click();
  await page
    .getByRole('link', { name: 'Traditional Scottish Stovies', exact: true })
    .first()
    .click();
  await expect(page).toHaveURL(/\/cook\?/);
  await expect(page.getByRole('button', { name: 'Next', exact: true }).first()).toBeVisible();
  await page.getByRole('button', { name: 'Next', exact: true }).first().click();
  await page.screenshot({ path: '/tmp/bord-mobile-cooking.png', fullPage: true });
  const created = await page.request.post('/api/v1/shopping-lists', {
    headers: mutationHeaders,
    data: { kind: 'manual', name: 'Quick shop' },
  });
  expect(created.ok()).toBeTruthy();
  const list = (await created.json()).list;
  const added = await page.request.post(`/api/v1/shopping-lists/${list.id}/items`, {
    headers: mutationHeaders,
    data: { item: 'Eggs', quantity: 12, unit: 'each', note: '', checked: false },
  });
  expect(added.ok()).toBeTruthy();
  await page.goto(`/lists/${list.id}`);
  await page.getByRole('button', { name: 'Shopping mode', exact: true }).click();
  await expect(page.getByRole('button', { name: /Shop with Instacart/i })).toHaveCount(0);
  await page.getByRole('button', { name: 'In cart', exact: true }).click();
  await expect(page.getByRole('button', { name: 'Remove from cart', exact: true })).toBeVisible();
  await page.getByRole('button', { name: 'Change quantity', exact: true }).click();
  await page.screenshot({ path: '/tmp/bord-mobile-cart-quantity.png', fullPage: true });
  await page.getByLabel('Quantity bought (each)').fill('6');
  await page.getByRole('button', { name: 'Save quantity', exact: true }).click();
  await expect(page.getByText(/6 each in cart/)).toBeVisible();
  const savedList = await page.request.get(`/api/v1/shopping-lists/${list.id}`);
  expect((await savedList.json()).list.items[0]).toMatchObject({ quantity: 12, cartQuantity: 6 });
  await page.screenshot({ path: '/tmp/bord-mobile-shopping.png', fullPage: true });
  await page.goto('/account');
  await page.getByRole('button', { name: 'Start my interview' }).click();
  await page
    .getByLabel('Do you lean sweet, savory, or a little of both?', { exact: true })
    .fill('Sweet tooth');
  await page.screenshot({ path: '/tmp/bord-mobile-interview.png', fullPage: true });
  for (let step = 0; step < 6; step++) {
    await page.getByRole('button', { name: 'Continue', exact: true }).click();
  }
  await page.getByRole('button', { name: 'Save context', exact: true }).click();
  await expect(page.getByText('Your kitchen context is saved.', { exact: false })).toBeVisible();
  const contextResponse = await page.request.get('/api/v1/account/kitchen-context');
  expect(contextResponse.ok()).toBeTruthy();
  expect((await contextResponse.json()).interview.taste).toBe('Sweet tooth');
  await page.route('**/api/v1/ai/chat/threads', (route) =>
    route.fulfill({ json: { threads: [{ id: 'test-thread' }] } }),
  );
  await page.route('**/api/v1/ai/chat/threads/test-thread', (route) =>
    route.fulfill({
      json: {
        messages: [{ id: 'one', role: 'assistant', content: 'Ready to help with dinner.' }],
        actions: [],
        jobs: [],
      },
    }),
  );
  await page.route('**/api/v1/ai/app-actions?*', (route) =>
    route.fulfill({ json: { proposals: [] } }),
  );
  await page.getByRole('button', { name: 'Open AI assistant', exact: true }).click();
  await expect(page.getByText('Ready to help with dinner.')).toBeVisible();
  await page.getByRole('button', { name: 'Assistant settings' }).click();
  await expect(
    page.getByText('Allow additional paid suggestions in this conversation'),
  ).toBeVisible();
  await page.screenshot({ path: '/tmp/bord-mobile-chat.png', fullPage: true });
  await page.getByRole('button', { name: 'Assistant settings' }).click();
  await page.evaluate(() => {
    if (!window.visualViewport) return;
    Object.defineProperty(window.visualViewport, 'height', { configurable: true, get: () => 480 });
    window.visualViewport.dispatchEvent(new Event('resize'));
  });
  const drawer = await page.getByRole('dialog', { name: 'Kitchen assistant' }).boundingBox();
  const composer = await page
    .getByRole('form', { name: 'AI assistant message composer' })
    .boundingBox();
  expect(drawer!.height).toBeGreaterThanOrEqual(840);
  expect(composer!.y + composer!.height).toBeLessThanOrEqual(480);
  await page.screenshot({ path: '/tmp/bord-mobile-keyboard.png', fullPage: true });
  expect(
    await page.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth),
  ).toBeTruthy();
  expect(errors).toEqual([]);
});
