import { test, expect } from '@playwright/test';
import { mkdirSync } from 'node:fs';
import { completeInitialOnboarding, signInWorkflowFixture } from './helpers/onboarding';
import { appAxe } from './helpers/accessibility';

const output = 'screenshots/refinement/catalog-native';
const reference = {
  transport_id: 'bord_food_api',
  source_id: 'usda_fdc',
  source_record_id: '123',
  source_revision: 'fixture_revision_1',
  catalog_generation: 'fixture_generation_1',
  canonical_product_id: 'prd_fixture',
};
const food = {
  catalogRef: reference,
  provider: 'usda_fdc',
  providerRecordId: '123',
  canonicalGtin: null,
  displayName: 'Synthetic rolled oats',
  genericName: 'Oats',
  brand: '',
  dataType: 'Foundation',
  quantity: '',
  servingSize: '',
  servingWeightGrams: null,
  categories: ['Grains'],
  ingredientsText: '',
  ingredientTags: [],
  allergens: [],
  labels: [],
  images: [],
  nutrients: [{ nutrientCode: 'protein', amount: 0, unit: 'g', basis: 'per_100g' }],
  nutrientBasis: 'per_100g',
  completeness: 0.1,
  sourceUrl: null,
  citation: 'USDA synthetic fixture',
  license: 'Public domain fixture',
  retrievedAt: '2026-10-19T12:00:00.000Z',
  schemaVersion: 1,
  providerMetadata: {},
};

async function signIn(page: import('@playwright/test').Page) {
  await page.goto('/');
  if ((await page.request.get('/api/v1/exports/recipes')).status() === 503) {
    await completeInitialOnboarding(page, 'Workflow refinement fixture', 'Maya');
    return;
  }
  await signInWorkflowFixture(page);
  await page.goto('/');
}

test('reviewed food shows source context, reflows and safely retries an uncertain confirmation', async ({
  page,
}) => {
  test.setTimeout(150_000);
  mkdirSync(output, { recursive: true });
  const errors: string[] = [];
  page.on('pageerror', (error) => errors.push(error.message));
  await signIn(page);
  await page.route('**/api/v1/food-data/searches', (route) =>
    route.fulfill({ json: { records: [food], localProducts: [], providerStatuses: [] } }),
  );
  await page.route('**/api/v1/food-data/details', (route) =>
    route.fulfill({ json: { record: food } }),
  );
  await page.route('**/api/v1/food-data/catalog/measures', (route) =>
    route.fulfill({
      json: {
        reference,
        measures: [
          {
            label: '1 cup',
            amount: 1,
            unit: 'cup',
            gramWeight: 120,
            form: 'dry',
            basis: 'as sold',
          },
          {
            label: '1 portion',
            amount: 1,
            unit: 'portion',
            gramWeight: null,
            form: null,
            basis: null,
          },
        ],
      },
    }),
  );
  await page.route('**/api/v1/food-data/catalog/storage-guidance', (route) =>
    route.fulfill({
      json: {
        guidance: [
          {
            id: 'guide_fixture',
            name: 'Dry oats',
            form: 'dry',
            storageState: 'unopened',
            details: { pantry: 'Keep dry in a closed container', after_opening_days: null },
            attribution: 'Synthetic FoodKeeper fixture',
            license: 'Public domain fixture',
            preciseExpiry: false,
          },
        ],
      },
    }),
  );
  await page.route('**/api/v1/food-data/catalog/retail-evidence', (route) =>
    route.fulfill({
      json: {
        evidence: {
          availability: 'unknown',
          assortment_status: 'historical_only',
          offers: [
            {
              amount_decimal: '0.00',
              currency: 'USD',
              channel: 'in_store',
              observed_at: '2020-01-02',
              valid_until: '2020-01-03',
            },
          ],
          placements: [],
          history_truncated: true,
          reason: 'Historical fixture only',
        },
      },
    }),
  );
  const imports: unknown[] = [];
  await page.route('**/api/v1/pantry/catalog-imports', async (route) => {
    imports.push(route.request().postDataJSON());
    await route.fulfill(
      imports.length === 1
        ? {
            status: 503,
            json: { error: { message: 'Synthetic lost acknowledgement: outcome unknown' } },
          }
        : { json: { productId: '00000000-0000-4000-8000-000000000123' } },
    );
  });
  await page.goto('/pantry');
  await expect(page).toHaveTitle(/Bòrd/u);
  await page.getByRole('button', { name: 'Add item', exact: true }).first().click();
  const dialog = page.getByRole('dialog', { name: 'Add pantry item' });
  await dialog.getByRole('tab', { name: 'Search', exact: true }).click();
  await dialog.getByLabel('Product name / barcode').fill('rolled oats');
  await dialog.getByRole('button', { name: 'Search', exact: true }).click();
  await dialog.getByRole('button', { name: /Synthetic rolled oats/u }).click();
  await dialog.getByText('Portion measures and storage guidance', { exact: true }).click();
  await dialog.getByRole('button', { name: 'Show source measures' }).click();
  await expect(dialog.getByText('1 cup · 120 g · dry · as sold')).toBeVisible();
  await dialog.getByRole('button', { name: 'Find storage guidance' }).click();
  await expect(dialog.getByText('Keep dry in a closed container')).toBeVisible();
  await dialog.getByRole('button', { name: 'Check public evidence' }).click();
  await expect(dialog.getByText(/bounded source history/u)).toBeVisible();
  await dialog.getByText('Observation dates, channels and details', { exact: true }).click();
  await expect(dialog.getByText(/0.00 USD · in store · Observed 2020-01-02/u)).toBeVisible();
  for (const width of [1440, 390, 320]) {
    await page.setViewportSize({ width, height: width === 1440 ? 1000 : 844 });
    await expect(dialog).toBeVisible();
    expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(
      true,
    );
    await dialog
      .getByText('Portion measures and storage guidance', { exact: true })
      .scrollIntoViewIfNeeded();
    await page.screenshot({ path: `${output}/food-context-${width}.png` });
  }
  expect((await appAxe(page).include('dialog[open]').analyze()).violations).toEqual([]);
  await page.setViewportSize({ width: 568, height: 320 });
  await dialog.getByRole('button', { name: 'Add Item', exact: true }).focus();
  await expect(dialog.getByRole('button', { name: 'Add Item', exact: true })).toBeInViewport();
  await page.screenshot({ path: `${output}/food-confirm-short-568.png` });
  await page.setViewportSize({ width: 390, height: 844 });
  await page.evaluate(() => (document.documentElement.style.fontSize = '200%'));
  await dialog.getByRole('button', { name: 'Add Item', exact: true }).focus();
  await expect(dialog.getByRole('button', { name: 'Add Item', exact: true })).toBeInViewport();
  expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(true);
  await page.screenshot({ path: `${output}/food-confirm-text-200.png` });
  await page.evaluate(() => (document.documentElement.style.fontSize = ''));
  await page.setViewportSize({ width: 320, height: 844 });
  await dialog.getByRole('button', { name: 'Add Item', exact: true }).click();
  await expect(dialog.getByRole('button', { name: 'Retry previous confirmation' })).toBeVisible();
  await expect(dialog.getByRole('button', { name: 'Close add item dialog' })).toBeDisabled();
  await expect(dialog.getByRole('textbox', { name: 'Name', exact: true })).toBeDisabled();
  await page.screenshot({ path: `${output}/uncertain-confirmation-320.png` });
  await dialog.getByRole('button', { name: 'Retry previous confirmation' }).click();
  await expect(dialog).not.toBeVisible();
  expect(imports).toHaveLength(2);
  expect(imports[1]).toEqual(imports[0]);
  expect(errors).toEqual([]);
});

test('store filters show human chain choices and preserve pagination intent', async ({ page }) => {
  test.setTimeout(100_000);
  mkdirSync(output, { recursive: true });
  await signIn(page);
  await page.route('**/api/v1/food-data/catalog/status', (route) =>
    route.fulfill({ json: { state: 'partial', storeDirectoryEnabled: true } }),
  );
  await page.route('**/api/v1/food-data/catalog/chains', (route) =>
    route.fulfill({
      json: {
        chains: [{ id: 'chn_fixture', name: 'Fixture Market', observedStoreCount: 2 }],
        nextCursor: null,
      },
    }),
  );
  const searches: Record<string, unknown>[] = [];
  await page.route('**/api/v1/food-data/catalog/stores', (route) => {
    searches.push(route.request().postDataJSON());
    return route.fulfill({
      json: {
        stores: [
          {
            id: `sto_${searches.length}`,
            name: `Fixture branch ${searches.length}`,
            content_revision: 'rev1',
            address: { city: 'Fixtureville' },
            status: null,
            hours: null,
            observedAt: null,
            source_refs: [],
          },
        ],
        nextCursor: searches.length === 1 ? 'page-two-bound-to-filters' : null,
      },
    });
  });
  await page.goto('/settings/lists');
  const panel = page.getByRole('region', { name: 'Official store directory' });
  await panel.getByText('Area, chain and nearby filters').click();
  await panel.getByRole('button', { name: 'Load available US chains' }).click();
  await panel.getByLabel('Chain (optional)').selectOption('chn_fixture');
  await panel.getByLabel('State or region code').fill('IA');
  await panel.getByRole('button', { name: 'Search', exact: true }).click();
  await expect(panel.getByText('Fixture branch 1')).toBeVisible();
  await panel.getByLabel('State or region code').fill('WI');
  await panel.getByRole('button', { name: 'Show more branches' }).click();
  await expect(panel.getByText('Fixture branch 2')).toBeVisible();
  expect(searches[1]).toMatchObject({
    state: 'IA',
    chainId: 'chn_fixture',
    cursor: 'page-two-bound-to-filters',
  });
  await page.context().grantPermissions(['geolocation']);
  await page.context().setGeolocation({ latitude: 41.5, longitude: -93.6 });
  await panel.getByRole('button', { name: 'Use my location for this search' }).click();
  await expect(panel.getByText(/Nearby filter selected/)).toBeVisible();
  expect(searches).toHaveLength(2); // Choosing location alone is not a provider search.
  await panel.getByRole('button', { name: 'Search', exact: true }).click();
  await expect.poll(() => searches.length).toBe(3);
  expect(searches[2]).toMatchObject({ latitude: 41.5, longitude: -93.6, radiusKm: 10 });
  for (const width of [1440, 390, 320]) {
    await page.setViewportSize({ width, height: width === 1440 ? 1000 : 844 });
    await panel.scrollIntoViewIfNeeded();
    expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(
      true,
    );
    await page.screenshot({ path: `${output}/store-filters-${width}.png` });
  }
  expect(
    (await appAxe(page).include('[aria-label="Official store directory"]').analyze()).violations,
  ).toEqual([]);
});
