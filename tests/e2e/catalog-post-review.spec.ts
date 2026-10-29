import { test, expect } from '@playwright/test';
import { mkdirSync } from 'node:fs';
import { signInWorkflowFixture } from './helpers/onboarding';
import { normalizeCatalogMeasure } from '../../shared/mobile-domain/catalog-measures';
import { appAxe } from './helpers/accessibility';

const output = 'screenshots/refinement/post-review/catalog';
const ref = (id: string) => ({
  transport_id: 'bord_food_api',
  source_id: 'usda_fdc',
  source_record_id: id,
  source_revision: `raw-${id}-revision`,
  catalog_generation: 'fixture-generation',
  canonical_product_id: `prd_${id}`,
});
const food = (id: string) => ({
  catalogRef: ref(id),
  provider: 'usda_fdc',
  providerRecordId: id,
  canonicalGtin: null,
  displayName: `Synthetic ${id} food`,
  genericName: '',
  brand: '',
  dataType: 'Foundation',
  quantity: '',
  servingSize: '',
  servingWeightGrams: null,
  categories: [],
  ingredientsText: '',
  ingredientTags: [],
  allergens: [],
  labels: [],
  images: [],
  nutrients: [{ nutrientCode: 'protein', amount: 0, unit: 'g', basis: 'per_100g' }],
  nutrientBasis: 'per_100g',
  completeness: 0.1,
  sourceUrl: null,
  citation: 'Synthetic raw USDA fixture',
  license: 'Public domain fixture',
  retrievedAt: '2026-10-20T00:00:00Z',
  schemaVersion: 1,
  providerMetadata: {},
});
test('source portions remain complete and old context cannot overwrite a newly reviewed food', async ({
  page,
}) => {
  test.setTimeout(150_000);
  mkdirSync(output, { recursive: true });
  await signInWorkflowFixture(page);
  await page.route('**/api/v1/food-data/searches', (route) =>
    route.fulfill({
      json: { records: [food('A'), food('B')], localProducts: [], providerStatuses: [] },
    }),
  );
  await page.route('**/api/v1/food-data/details', (route) =>
    route.fulfill({ json: { record: food(route.request().postDataJSON().recordId) } }),
  );
  let releaseA: (() => void) | undefined;
  let sawA = false;
  await page.route('**/api/v1/food-data/catalog/measures', async (route) => {
    const id = route.request().postDataJSON().reference.source_record_id;
    if (id === 'A') {
      sawA = true;
      await new Promise<void>((resolve) => {
        releaseA = resolve;
      });
    }
    const raw = {
      amount: id === 'A' ? 0.5 : 2,
      measureUnit: { name: 'cup' },
      modifier: 'chopped',
      portionDescription: id === 'A' ? 'Old A detail' : 'Prepared B detail',
      gramWeight: id === 'A' ? 60 : 240,
      form: 'prepared',
      basis: 'as sold',
    };
    await route
      .fulfill({ json: { reference: ref(id), measures: [normalizeCatalogMeasure(raw)] } })
      .catch(() => {});
  });
  const enrichment: unknown[] = [];
  await page.route('**/api/v1/food-data/catalog/enrichment', (route) => {
    enrichment.push(route.request().postDataJSON());
    return route.fulfill({
      json: {
        lines: [
          {
            lineId: 'reviewed-food',
            product: { id: 'prd_B', revision: 'canonical-B', name: 'Synthetic B food' },
            evidence: null,
          },
        ],
      },
    });
  });
  const writes: Record<string, unknown>[] = [];
  await page.route('**/api/v1/pantry/catalog-imports', (route) => {
    writes.push(route.request().postDataJSON());
    return route.fulfill({
      status: 503,
      json: { error: { message: 'Synthetic unknown acknowledgement; keep the exact command.' } },
    });
  });
  await page.goto('/pantry/add?mode=search');
  const dialog = page.getByRole('region', { name: 'Find a pantry product' });
  await dialog.getByLabel('Product name / barcode').fill('Synthetic food');
  await dialog.getByRole('button', { name: 'Search', exact: true }).click();
  await dialog.getByRole('button', { name: /Synthetic A food/ }).click();
  await dialog.getByText('Portion measures and storage guidance', { exact: true }).click();
  await dialog.getByRole('button', { name: 'Show source measures' }).click();
  await expect.poll(() => sawA).toBe(true);
  await dialog.getByRole('button', { name: 'Back to results' }).click();
  await dialog.getByRole('button', { name: /Synthetic B food/ }).click();
  await dialog.getByText('Portion measures and storage guidance', { exact: true }).click();
  await dialog.getByRole('button', { name: 'Show source measures' }).click();
  const usePortion = dialog.getByRole('button', {
    name: 'Use source portion (2 cup · chopped) · 240 g',
    exact: true,
  });
  await expect(usePortion).toBeVisible();
  releaseA?.();
  await expect(dialog.getByText('Old A detail')).toHaveCount(0);
  await usePortion.click();
  await expect(dialog.locator('[name="quantityRemaining"]')).toHaveValue('240');
  await expect(dialog.locator('[name="unit"]')).toHaveValue('g');
  await dialog.getByRole('button', { name: 'Review identified product enrichment' }).click();
  await expect(page.getByText(/read has not changed/i)).toBeVisible();
  expect(enrichment).toEqual([{ lines: [{ lineId: 'reviewed-food', productId: 'prd_B' }] }]);
  expect(writes).toHaveLength(0);
  for (const width of [1440, 390, 320]) {
    await page.setViewportSize({ width, height: width === 1440 ? 1000 : 844 });
    await usePortion.evaluate((element) => element.scrollIntoView({ block: 'center' }));
    expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(
      true,
    );
    await page.screenshot({ path: `${output}/source-portion-${width}.png` });
  }
  expect((await appAxe(page).include('#add-panel-search').analyze()).violations).toEqual([]);
  await page.setViewportSize({ width: 390, height: 500 });
  await page.evaluate(() => {
    document.documentElement.style.fontSize = '200%';
  });
  const addItem = dialog.getByRole('button', { name: 'Add Item', exact: true });
  await addItem.focus();
  // Enlarged text reflows the page, so bring the button into view the way a person would scroll.
  await addItem.scrollIntoViewIfNeeded();
  await expect(addItem).toBeInViewport();
  await page.screenshot({ path: `${output}/confirm-short-enlarged-390.png` });
  await dialog.getByRole('button', { name: 'Add Item', exact: true }).click();
  await expect(dialog.getByRole('button', { name: 'Retry previous confirmation' })).toBeVisible();
  await expect(dialog.getByRole('button', { name: 'Back to results' })).toBeDisabled();
  expect(writes[0]).toMatchObject({
    selection: { catalogRef: ref('B') },
    batches: [{ quantityRemaining: 240, unit: 'g' }],
  });
});
