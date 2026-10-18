import { test, expect } from '@playwright/test';
import { completeInitialOnboarding } from './helpers/onboarding';
import { appAxe } from './helpers/accessibility';

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
  const settingsTrigger = page.getByRole('button', { name: 'Plan settings', exact: true });
  for (const width of [320, 390, 768, 1440]) {
    await page.setViewportSize({ width, height: 844 });
    await settingsTrigger.click();
    const settings = page.getByRole('dialog', { name: 'Plan settings', exact: true });
    await expect(settings).toBeVisible();
    await settings.getByRole('button', { name: 'Close plan settings' }).focus();
    await page.keyboard.press('Shift+Tab');
    await expect(settings.getByRole('button', { name: 'Done', exact: true })).toBeFocused();
    await page.keyboard.press('Tab');
    await expect(settings.getByRole('button', { name: 'Close plan settings' })).toBeFocused();
    const bounds = await settings.boundingBox();
    expect(bounds!.x).toBeGreaterThanOrEqual(0);
    expect(bounds!.x + bounds!.width).toBeLessThanOrEqual(width);
    expect(bounds!.y + bounds!.height).toBeLessThanOrEqual(844);
    await settings.getByRole('button', { name: 'Edit types', exact: true }).click();
    await expect(
      settings.getByRole('group', { name: 'Meal types shown in the planner' }),
    ).toBeVisible();
    await settings.getByRole('button', { name: 'Close meal type settings' }).click();
    await settings.locator('button[aria-controls="planner-date-range-picker"]').click();
    await expect(settings.getByLabel('Start date', { exact: true })).toBeVisible();
    await settings.getByLabel('Start date', { exact: true }).focus();
    await page.keyboard.press('Escape');
    await expect(settings).toBeVisible();
    await expect(settings.getByLabel('Start date', { exact: true })).toHaveCount(0);
    await page.screenshot({ path: `/tmp/bord-planner-settings-${width}.png` });
    await page.keyboard.press('Escape');
    await expect(settings).toHaveCount(0);
    await expect(settingsTrigger).toBeFocused();
    const trigger = page
      .getByLabel('Actions for Traditional Scottish Stovies')
      .filter({ visible: true });
    await trigger.scrollIntoViewIfNeeded();
    const card = page.getByRole('article').filter({ has: trigger });
    const cardBounds = await card.boundingBox();
    const slotBounds = await card.locator('..').boundingBox();
    expect(cardBounds!.y + cardBounds!.height).toBeLessThanOrEqual(
      slotBounds!.y + slotBounds!.height + 1,
    );
    const button = await trigger.boundingBox();
    const icon = await trigger.locator('svg').boundingBox();
    expect(Math.abs(button!.width - button!.height)).toBeLessThan(1);
    expect(Math.abs(button!.x + button!.width / 2 - (icon!.x + icon!.width / 2))).toBeLessThan(1);
    expect(Math.abs(button!.y + button!.height / 2 - (icon!.y + icon!.height / 2))).toBeLessThan(1);
    expect(
      await page.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth),
    ).toBeTruthy();
    await page.screenshot({ path: `/tmp/bord-planner-cards-${width}.png` });
  }
  await page.setViewportSize({ width: 390, height: 844 });
  await page.evaluate(() => {
    document.documentElement.dataset.theme = 'dark';
    document.documentElement.style.colorScheme = 'dark';
  });
  await settingsTrigger.click();
  const darkSettings = page.getByRole('dialog', { name: 'Plan settings', exact: true });
  expect((await appAxe(page).include('#planner-settings-panel').analyze()).violations).toEqual([]);
  await page.screenshot({ path: '/tmp/bord-planner-settings-dark.png' });
  await darkSettings.getByRole('button', { name: 'Done', exact: true }).click();
  await page
    .getByLabel('Actions for Traditional Scottish Stovies')
    .filter({ visible: true })
    .scrollIntoViewIfNeeded();
  await page.screenshot({ path: '/tmp/bord-planner-cards-dark.png' });
  await page
    .getByRole('article')
    .filter({
      has: page.getByLabel('Actions for Traditional Scottish Stovies').filter({ visible: true }),
    })
    .screenshot({ path: '/tmp/bord-planner-card-detail-dark.png' });
  await page.evaluate(() => {
    document.documentElement.dataset.theme = 'light';
    document.documentElement.style.colorScheme = 'light';
  });
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
  await page.getByRole('button', { name: 'Edit meal / adapt recipe', exact: true }).click();
  await expect(page.getByRole('dialog', { name: 'Edit planned meal', exact: true })).toBeVisible();
  await page.getByRole('button', { name: 'Close meal editor', exact: true }).click();
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
