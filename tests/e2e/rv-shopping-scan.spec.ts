import { test, expect } from '@playwright/test';
import { mkdirSync, writeFileSync } from 'node:fs';
import { execFileSync } from 'node:child_process';
import { signInWorkflowFixture } from './helpers/onboarding';
import { appAxe } from './helpers/accessibility';

test('web scan uses the saved local product during provider outage and keeps purchase dimensions', async ({
  page,
}) => {
  test.setTimeout(150_000);
  await signInWorkflowFixture(page);
  const headers = { Origin: 'http://127.0.0.1:3100' };
  const name = `Scan fixture oats ${Date.now()}`;
  const productResponse = await page.request.post('/api/v1/pantry/products', {
    headers,
    data: { displayName: name, defaultInventoryUnit: 'g' },
  });
  expect(productResponse.ok()).toBe(true);
  const { product } = await productResponse.json();
  const listResponse = await page.request.post('/api/v1/shopping-lists', {
    headers,
    data: { kind: 'manual', name: 'RV scanned cart fixture' },
  });
  expect(listResponse.ok()).toBe(true);
  const { list } = await listResponse.json();
  const itemResponse = await page.request.post(`/api/v1/shopping-lists/${list.id}/items`, {
    headers,
    data: {
      item: name,
      quantity: 2,
      unit: 'each',
      note: '',
      checked: false,
      productId: product.id,
    },
  });
  expect(itemResponse.ok()).toBe(true);
  const prior = await (await page.request.get(`/api/v1/shopping-lists/${list.id}`)).json();
  const item = prior.list.items[0];
  const initialCart = await page.request.post(`/api/v1/shopping-lists/${list.id}/catalog-items`, {
    headers,
    data: {
      operationId: crypto.randomUUID(),
      localProductId: product.id,
      itemId: item.id,
      expectedUpdatedAt: item.updatedAt,
      cartIntent: 'replace_existing',
      cartQuantity: 500,
      cartUnit: 'g',
    },
  });
  expect(initialCart.ok()).toBe(true);
  const consoleErrors: string[] = [];
  page.on('pageerror', (error) => consoleErrors.push(error.message));
  await page.route('**/api/v1/food-data/barcode-lookups', (route) =>
    route.fulfill({
      json: {
        localProduct: { id: product.id, displayName: name, brand: '', defaultInventoryUnit: 'g' },
        preferred: null,
        alternatives: [],
        providerStatuses: [{ provider: 'usda_fdc', status: 'unavailable' }],
      },
    }),
  );
  const commands: Record<string, unknown>[] = [];
  await page.route('**/api/v1/shopping-lists/*/catalog-items', async (route) => {
    commands.push(route.request().postDataJSON());
    await route.continue();
  });
  await page.goto(`/lists/${list.id}`);
  expect(page.url()).toContain(`/lists/${list.id}`);
  expect(await page.title()).toBeTruthy();
  await page.getByRole('button', { name: 'Scan item' }).click();
  const dialog = page.getByRole('dialog', { name: 'Scan mode' });
  await dialog.getByLabel('Enter barcode').fill('049000042511');
  await dialog.getByRole('button', { name: 'Look up', exact: true }).click();
  await expect(dialog.getByText(/Saved household product/)).toBeVisible();
  await dialog.getByLabel('Cart destination').selectOption(item.id);
  await expect(dialog.getByText(/Replace 500 g in cart with 1 g/)).toBeVisible();
  const output = 'screenshots/refinement/rv/shopping-scan';
  mkdirSync(output, { recursive: true });
  writeFileSync(
    `${output}/source.json`,
    JSON.stringify(
      {
        revision: execFileSync('git', ['rev-parse', 'HEAD'], { encoding: 'utf8' }).trim(),
        workingTree: execFileSync('git', ['status', '--porcelain'], { encoding: 'utf8' }).trim()
          ? 'working-tree changes'
          : 'clean',
        capturedAt: new Date().toISOString(),
        state:
          'Synthetic local-only provider-outage barcode review; purchase replacement 500 g to 1 g, recipe demand 2 each',
        viewports: [
          { width: 1440, height: 1000 },
          { width: 390, height: 844 },
          { width: 320, height: 844 },
        ],
        provider:
          'Intercepted barcode response; local confirmation uses the real application route and SQLite fixture',
      },
      null,
      2,
    ) + '\n',
  );
  for (const width of [1440, 390, 320]) {
    await page.setViewportSize({ width, height: width === 1440 ? 1000 : 844 });
    await dialog
      .getByRole('button', { name: 'Confirm replacement cart amount' })
      .scrollIntoViewIfNeeded();
    expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(
      true,
    );
    await page.screenshot({ path: `${output}/local-replacement-${width}.png` });
  }
  expect((await appAxe(page).include('dialog[open]').analyze()).violations).toEqual([]);
  await dialog.getByRole('button', { name: 'Confirm replacement cart amount' }).click();
  await expect(
    dialog.getByText('Cart amount saved. No purchase completion or Pantry intake was recorded.'),
  ).toBeVisible();
  expect(commands[0]).toMatchObject({
    localProductId: product.id,
    cartIntent: 'replace_existing',
    cartQuantity: 1,
    cartUnit: 'g',
    itemId: item.id,
  });
  let current = await (await page.request.get(`/api/v1/shopping-lists/${list.id}`)).json();
  expect(current.list.items[0]).toMatchObject({
    quantity: 2,
    unit: 'each',
    cartQuantity: 1,
    cartUnit: 'g',
    checked: false,
    shoppingState: 'in_cart',
    pantry: { productId: product.id },
  });
  await dialog.getByRole('button', { name: 'Scan another product' }).click();
  await dialog.getByLabel('Enter barcode').fill('049000042511');
  await dialog.getByRole('button', { name: 'Look up', exact: true }).click();
  await dialog.getByLabel('Amount', { exact: true }).fill('500');
  await dialog.getByRole('button', { name: 'Confirm separate cart entry' }).click();
  await expect(
    dialog.getByText('Cart amount saved. No purchase completion or Pantry intake was recorded.'),
  ).toBeVisible();
  current = await (await page.request.get(`/api/v1/shopping-lists/${list.id}`)).json();
  expect(current.list.items).toHaveLength(2);
  expect(current.list.items.find((row: { id: string }) => row.id === item.id)).toMatchObject({
    quantity: 2,
    unit: 'each',
    cartQuantity: 1,
    cartUnit: 'g',
  });
  const added = current.list.items.find((row: { id: string }) => row.id !== item.id);
  expect(added).toMatchObject({
    quantity: null,
    unit: '',
    cartQuantity: 500,
    cartUnit: 'g',
    checked: false,
    pantry: { productId: product.id },
  });
  expect(commands[1]).not.toHaveProperty('itemId');

  // A lost response retains its operation; inspection and deliberate closure
  // are real server calls, not a cosmetic reset of the confirmation lock.
  await dialog.getByRole('button', { name: 'Scan another product' }).click();
  await dialog.getByLabel('Enter barcode').fill('049000042511');
  await dialog.getByRole('button', { name: 'Look up', exact: true }).click();
  await page.route('**/api/v1/shopping-lists/*/catalog-items', (route) => route.abort('failed'), {
    times: 1,
  });
  await dialog.getByRole('button', { name: 'Confirm separate cart entry' }).click();
  const inspect = dialog.getByRole('button', { name: 'Check original confirmation receipt' });
  await expect(inspect).toBeVisible();
  await inspect.focus();
  await inspect.press('Enter');
  await expect(dialog.getByText(/An absent receipt remains an unknown outcome/)).toBeVisible();
  const popupPromise = page.waitForEvent('popup');
  await dialog.getByRole('link', { name: 'Review saved list in another tab' }).click();
  const savedList = await popupPromise;
  await savedList.waitForLoadState('domcontentloaded');
  await expect(savedList).toHaveURL(new RegExp(`/lists/${list.id}$`));
  await savedList.close();
  const closeUnknown = dialog.getByRole('button', {
    name: 'I reviewed the list — close unknown confirmation',
  });
  await closeUnknown.focus();
  await expect(closeUnknown).toBeFocused();
  await closeUnknown.scrollIntoViewIfNeeded();
  await page.screenshot({ path: `${output}/unknown-review-320.png` });
  expect((await appAxe(page).include('dialog[open]').analyze()).violations).toEqual([]);
  await closeUnknown.press('Enter');
  await expect(
    dialog.getByText(/Future execution is blocked. The earlier outcome remains unknown/),
  ).toBeVisible();
  await expect(dialog.getByLabel('Enter barcode')).toBeEnabled();
  current = await (await page.request.get(`/api/v1/shopping-lists/${list.id}`)).json();
  expect(current.list.items).toHaveLength(2);
  expect(consoleErrors).toEqual([]);
});
