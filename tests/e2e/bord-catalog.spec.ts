import { test, expect } from '@playwright/test';
import { completeInitialOnboarding } from './helpers/onboarding';
import { appAxe } from './helpers/accessibility';

test('official store directory stays compact and preserves household edits on mobile', async ({
  page,
}) => {
  test.setTimeout(150_000);
  const errors: string[] = [];
  page.on('pageerror', (error) => errors.push(error.message));
  await page.setViewportSize({ width: 390, height: 844 });
  await completeInitialOnboarding(page, 'Catalog browser fixture', 'Maya');
  const response = await page.request.get('/api/v1/supermarket-profiles');
  const workspace = await response.json();
  const profile = workspace.profiles[0];
  const store = {
    id: 'sto_fixture',
    name: 'Synthetic Fixture Branch',
    address: { street: '1 Imaginary Lane', city: 'Fixtureville' },
    content_revision: 'store_1',
    status: 'open',
    hours: null,
    observedAt: null,
    source_refs: [{ source_id: 'all_the_places' }],
  };
  await page.route('**/api/v1/food-data/catalog/status', (route) =>
    route.fulfill({
      json: { state: 'partial', mode: 'catalog_only', storeDirectoryEnabled: true },
    }),
  );
  await page.route('**/api/v1/food-data/catalog/stores', (route) =>
    route.fulfill({ json: { stores: [store], nextCursor: null, warnings: [] } }),
  );
  await page.route(`**/api/v1/supermarket-profiles/${profile.id}/catalog-link`, async (route) => {
    if (route.request().method() === 'GET') {
      await route.fulfill({
        json: {
          store,
          changed: false,
          maps: [
            {
              id: 'map_fixture',
              sourceUrl: 'https://retailer.example.test/map',
              rightsStatus: 'pending',
              displayPermitted: false,
            },
          ],
          mapState: 'rights_blocked',
        },
      });
      return;
    }
    const linked = route.request().method() !== 'DELETE';
    profile.catalogStoreId = linked ? store.id : null;
    profile.catalogMetadata = linked ? JSON.stringify(store) : null;
    await route.fulfill({ json: workspace });
  });
  await page.goto('/settings/lists');
  const panel = page.getByRole('region', { name: 'Official store directory' });
  await expect(panel.getByText('Directory · partial')).toBeVisible();
  await page.getByRole('textbox', { name: /^Store name/u }).fill('Unsaved local label');
  await panel.getByLabel('Find a branch').fill('Fixture');
  await panel.getByRole('button', { name: 'Search', exact: true }).click();
  await expect(panel.getByText(store.name, { exact: true })).toBeVisible();
  await panel.getByRole('button', { name: 'Link branch' }).click();
  await expect(panel.getByRole('button', { name: 'Unlink', exact: true })).toBeVisible();
  await expect(page.getByRole('textbox', { name: /^Store name/u })).toHaveValue(
    'Unsaved local label',
  );
  await panel.getByRole('button', { name: 'Review official updates' }).click();
  await expect(panel.getByRole('link', { name: /Official map/u })).toHaveAttribute(
    'href',
    'https://retailer.example.test/map',
  );
  await expect(panel.getByText(/rights blocked/u)).toBeVisible();
  for (const width of [320, 390, 768, 1440]) {
    await page.setViewportSize({ width, height: 844 });
    await panel.scrollIntoViewIfNeeded();
    const bounds = await panel.boundingBox();
    expect(bounds!.x).toBeGreaterThanOrEqual(0);
    expect(bounds!.x + bounds!.width).toBeLessThanOrEqual(width + 1);
    expect(
      await page.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth),
    ).toBeTruthy();
    await panel.screenshot({ path: `/tmp/bord-catalog-panel-${width}.png` });
    await page.screenshot({ path: `/tmp/bord-catalog-${width}.png`, fullPage: true });
  }
  expect(
    (await appAxe(page).include('[aria-label="Official store directory"]').analyze()).violations,
  ).toEqual([]);
  await page.evaluate(() => {
    document.documentElement.dataset.theme = 'dark';
  });
  expect(
    (await appAxe(page).include('[aria-label="Official store directory"]').analyze()).violations,
  ).toEqual([]);
  await panel.screenshot({ path: '/tmp/bord-catalog-panel-dark.png' });
  await panel.getByRole('button', { name: 'Unlink', exact: true }).click();
  await expect(panel.getByText(/Unlinked. Your custom store/u)).toBeVisible();
  await expect(page.getByRole('textbox', { name: /^Store name/u })).toHaveValue(
    'Unsaved local label',
  );
  const created = await page.request.post('/api/v1/shopping-lists', {
    headers: { Origin: 'http://127.0.0.1:3100' },
    data: { kind: 'manual', name: 'Store selection fixture' },
  });
  expect(created.status()).toBe(201);
  const list = (await created.json()).list;
  await page.setViewportSize({ width: 390, height: 844 });
  await page.goto(`/lists/${list.id}`);
  await page.getByRole('button', { name: 'Manage list', exact: true }).click();
  const storeChoice = page.getByRole('combobox', { name: 'Shopping at' });
  await Promise.all([page.waitForEvent('load'), storeChoice.selectOption('')]);
  await expect
    .poll(async () => {
      const response = await page.request.get(`/api/v1/shopping-lists/${list.id}`);
      return (await response.json()).list.supermarketProfileId;
    })
    .toBeNull();
  await page.getByRole('button', { name: 'Manage list', exact: true }).click();
  await Promise.all([page.waitForEvent('load'), storeChoice.selectOption(profile.id)]);
  await expect
    .poll(async () => {
      const response = await page.request.get(`/api/v1/shopping-lists/${list.id}`);
      return (await response.json()).list.supermarketProfileId;
    })
    .toBe(profile.id);
  await page.reload();
  await page.getByRole('button', { name: 'Manage list', exact: true }).click();
  await expect(storeChoice).toHaveValue(profile.id);
  for (const width of [320, 390, 768, 1440]) {
    await page.setViewportSize({ width, height: 844 });
    await expect(storeChoice).toBeVisible();
    expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(
      true,
    );
  }
  expect(
    (await appAxe(page).include('[aria-label="Supermarket for this list"]').analyze()).violations,
  ).toEqual([]);
  expect(errors).toEqual([]);
});
