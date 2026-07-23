import AxeBuilder from '@axe-core/playwright';
import { expect, test, type Page, type TestInfo } from '@playwright/test';

import { completeInitialOnboarding } from './helpers/onboarding';

async function capture(page: Page, testInfo: TestInfo, name: string) {
  const path = testInfo.outputPath(`${name}.png`);
  await page.screenshot({ path, fullPage: true });
  await testInfo.attach(name, { path, contentType: 'image/png' });
}

async function expectSaved(page: Page, text: string) {
  await expect(page.getByRole('status')).toHaveText(text);
}

async function openDetails(details: ReturnType<Page['locator']>, summaryName: string) {
  await expect(async () => {
    await expect(details).toHaveCount(1);
    const summary = details.getByText(summaryName, { exact: true });
    await expect(summary).toHaveCount(1);
    await expect(summary).toBeVisible();
    if ((await details.getAttribute('open')) === null) await summary.click();
    await expect(details).toHaveAttribute('open', '');
  }).toPass();
}

function actionForm(page: Page, manage: ReturnType<Page['locator']>, buttonName: string) {
  return manage.locator('form', {
    has: page.getByRole('button', { name: buttonName, exact: true }),
  });
}

test('Pantry inventory management is complete, persistent, accessible, and responsive', async ({
  page,
}, testInfo) => {
  testInfo.setTimeout(180_000);
  const browserErrors: string[] = [];
  page.on('console', (message) => message.type() === 'error' && browserErrors.push(message.text()));
  page.on('pageerror', (error) => browserErrors.push(error.message));

  await page.setViewportSize({ width: 1440, height: 1000 });
  await completeInitialOnboarding(page, 'Inventory management kitchen', 'Morgan');
  await page.goto('/pantry');

  const add = page.locator('details', { hasText: 'Add Pantry item' });
  await openDetails(add, 'Add Pantry item');
  await add.getByLabel('New product name').fill('Management beans');
  await add.getByLabel('Quantity', { exact: true }).fill('12');
  await add.locator('select[name="unit"]').selectOption('each');
  await add.getByLabel('Separate batches').fill('2');
  await add.getByLabel('Best before').fill('2027-09-30');
  await add.getByLabel('Date precision').selectOption('estimated');
  await add.getByLabel('Notes').fill('UI-created inventory proof');
  await add.getByLabel('Staple product').check();
  await add.getByRole('button', { name: 'Add item' }).click();
  await expectSaved(page, '2 Pantry batches added.');

  const products = page.locator('details', { hasText: 'Manage products and staples' });
  await openDetails(products, 'Manage products and staples');
  const product = products.locator('details', { hasText: 'Management beans' });
  await openDetails(product, 'Management beans');
  await product.getByLabel('Aliases (comma separated)').fill('beans, pantry beans');
  await product.getByLabel('Minimum stock').fill('4');
  await product.getByLabel('Target stock').fill('12');
  await product.getByLabel('Reorder threshold').fill('5');
  await product.getByLabel('Preferred store').fill('Market');
  await product.getByLabel('Suggest grocery restock').check();
  await product.getByRole('button', { name: 'Save product' }).click();
  await expectSaved(page, 'Product details saved.');

  const locations = page.locator('details', { hasText: 'Manage locations' });
  await openDetails(locations, 'Manage locations');
  await locations.locator('form').last().getByLabel('Name').fill('Cold room');
  await locations.locator('form').last().getByLabel('Storage type').selectOption('refrigerator');
  await locations.getByRole('button', { name: 'Add location' }).click();
  await expectSaved(page, 'Storage location added.');
  await openDetails(locations, 'Manage locations');
  const coldRoom = locations
    .locator('summary')
    .filter({ hasText: /^Cold room$/u })
    .locator('..');
  await expect(coldRoom).toHaveCount(1);
  await openDetails(coldRoom, 'Cold room');
  await coldRoom.getByLabel('Name').fill('Cold room shelf');
  await coldRoom.getByLabel('Order').fill('7');
  await coldRoom.getByRole('button', { name: 'Save location' }).click();
  await expectSaved(page, 'Storage location saved.');
  await openDetails(locations, 'Manage locations');
  const locationCreate = locations.locator('form').last();
  await locationCreate.getByLabel('Name').fill('Basket');
  await locationCreate.getByLabel('Inside').selectOption({ label: 'Cold room shelf' });
  await locationCreate.getByLabel('Storage type').selectOption('refrigerator');
  await locationCreate.getByRole('button', { name: 'Add location' }).click();
  await expectSaved(page, 'Storage location added.');
  await openDetails(locations, 'Manage locations');
  const basket = locations
    .locator('summary')
    .filter({ hasText: /^Cold room shelf \/ Basket$/u })
    .locator('..');
  await expect(basket).toHaveCount(1);
  await openDetails(basket, 'Cold room shelf / Basket');
  await basket.getByLabel('Name').fill('Cold basket');
  await basket.getByLabel('Order').fill('2');
  await basket.getByLabel('Archive location').check();
  await basket.getByRole('button', { name: 'Save location' }).click();
  await expectSaved(page, 'Storage location saved.');

  let cards = page.locator('article', {
    has: page.getByRole('heading', { name: 'Management beans', exact: true }),
  });
  await expect(cards).toHaveCount(2);
  let card = cards.first();
  let manage = card.locator('details', { hasText: 'Manage batch' });
  await openDetails(manage, 'Manage batch');
  const combineForm = actionForm(page, manage, 'Combine batches');
  await expect(combineForm).toHaveCount(1);
  await combineForm.getByRole('combobox').selectOption({ index: 1 });
  await combineForm.getByRole('button', { name: 'Combine batches' }).click();
  await expectSaved(page, 'Batches combined.');
  await cards.first().getByRole('button', { name: 'Undo' }).click();
  await expectSaved(page, 'Last action undone.');

  await openDetails(add, 'Add Pantry item');
  await add.getByLabel('Existing product').selectOption({ label: 'Management beans' });
  await add.getByLabel('Quantity', { exact: true }).fill('');
  await add.getByLabel('Original quantity').fill('');
  await add.getByLabel('Or approximate amount').selectOption('quarter');
  await add
    .getByRole('combobox', { name: 'Location', exact: true })
    .selectOption({ label: 'Cold room shelf' });
  await add.getByLabel('Package count').fill('1');
  await add.getByLabel('Package unit').selectOption('package');
  await add.getByLabel('Use by').fill('2027-10-02');
  await add.getByLabel('Date precision').selectOption('exact');
  await add.getByRole('button', { name: 'Add item' }).click();
  await expectSaved(page, 'Pantry item added.');

  card = cards.first();
  manage = card.locator('details', { hasText: 'Manage batch' });
  await openDetails(manage, 'Manage batch');
  await manage.getByLabel('Shelf or sub-location').fill('Upper basket');
  await manage.getByLabel('Price in cents').fill('399');
  await manage.getByRole('button', { name: 'Save batch details' }).click();
  await expectSaved(page, 'Batch details saved.');

  cards = page.locator('article', {
    has: page.getByRole('heading', { name: 'Management beans', exact: true }),
  });
  card = cards.first();
  await card.getByRole('button', { name: 'Add another batch' }).click();
  await expectSaved(page, 'Recent batch duplicated for unpacking.');
  await expect(cards).toHaveCount(4);

  card = cards.first();
  await card.getByRole('button', { name: 'Open' }).click();
  await expectSaved(page, 'Package opened.');
  card = cards.first();
  manage = card.locator('details', { hasText: 'Manage batch' });
  await openDetails(manage, 'Manage batch');
  const moveForm = actionForm(page, manage, 'Move batch');
  await expect(moveForm).toHaveCount(1);
  await moveForm.getByRole('combobox').selectOption({ label: 'Cold room shelf' });
  await moveForm.getByRole('button', { name: 'Move batch' }).click();
  await expectSaved(page, 'Batch moved.');

  card = cards.first();
  manage = card.locator('details', { hasText: 'Manage batch' });
  await openDetails(manage, 'Manage batch');
  const freezeForm = actionForm(page, manage, 'Freeze batch');
  await expect(freezeForm).toHaveCount(1);
  await freezeForm.getByLabel(/Frozen date/u).fill('2027-08-01');
  await freezeForm.getByRole('button', { name: 'Freeze batch', exact: true }).click();
  await expectSaved(page, 'Batch frozen.');
  card = cards.first();
  manage = card.locator('details', { hasText: 'Manage batch' });
  await openDetails(manage, 'Manage batch');
  const thawForm = actionForm(page, manage, 'Thaw batch');
  await expect(thawForm).toHaveCount(1);
  await thawForm.getByLabel(/Thawed date/u).fill('2027-08-02');
  await thawForm.getByRole('button', { name: 'Thaw batch', exact: true }).click();
  await expectSaved(page, 'Batch thawed.');

  card = cards.first();
  manage = card.locator('details', { hasText: 'Manage batch' });
  await openDetails(manage, 'Manage batch');
  const correctForm = actionForm(page, manage, 'Correct quantity');
  await expect(correctForm).toHaveCount(1);
  await correctForm.getByLabel(/Corrected amount/u).fill('10');
  await correctForm.getByRole('button', { name: 'Correct quantity', exact: true }).click();
  await expectSaved(page, 'Quantity corrected.');
  card = cards.first();
  manage = card.locator('details', { hasText: 'Manage batch' });
  await openDetails(manage, 'Manage batch');
  const splitForm = actionForm(page, manage, 'Split batch');
  await expect(splitForm).toHaveCount(1);
  await splitForm.getByLabel(/Split amount/u).fill('2');
  await splitForm.getByRole('button', { name: 'Split batch', exact: true }).click();
  await expectSaved(page, 'Batch split.');
  await cards.first().getByRole('button', { name: 'Undo' }).click();
  await expectSaved(page, 'Last action undone.');

  card = cards.first();
  await card.getByLabel(/Amount of Management beans consumed/u).fill('1');
  await card.getByRole('button', { name: 'Use amount' }).click();
  await expectSaved(page, 'Stock consumed.');
  await cards.first().getByRole('button', { name: '−1' }).click();
  await expectSaved(page, 'One item consumed.');

  await page.getByRole('checkbox', { name: 'Show inactive and archived', exact: true }).check();
  card = cards.first();
  manage = card.locator('details', { hasText: 'Manage batch' });
  await openDetails(manage, 'Manage batch');
  const discardForm = actionForm(page, manage, 'Discard batch');
  await expect(discardForm).toHaveCount(1);
  await discardForm.getByPlaceholder('Reason').fill('Damaged');
  await discardForm.getByRole('button', { name: 'Discard batch', exact: true }).click();
  await expectSaved(page, 'Batch discarded.');
  card = cards.first();
  manage = card.locator('details', { hasText: 'Manage batch' });
  await openDetails(manage, 'Manage batch');
  const restoreAfterDiscardForm = actionForm(page, manage, 'Restore batch');
  await expect(restoreAfterDiscardForm).toHaveCount(1);
  await restoreAfterDiscardForm.getByLabel(/Restored amount/u).fill('6');
  await restoreAfterDiscardForm.getByRole('button', { name: 'Restore batch', exact: true }).click();
  await expectSaved(page, 'Batch restored.');
  card = cards.first();
  manage = card.locator('details', { hasText: 'Manage batch' });
  await openDetails(manage, 'Manage batch');
  const donateForm = actionForm(page, manage, 'Donate batch');
  await expect(donateForm).toHaveCount(1);
  await donateForm.getByPlaceholder('Reason').fill('Community shelf');
  await donateForm.getByRole('button', { name: 'Donate batch', exact: true }).click();
  await expectSaved(page, 'Batch donated.');
  card = cards.first();
  manage = card.locator('details', { hasText: 'Manage batch' });
  await openDetails(manage, 'Manage batch');
  const restoreAfterDonateForm = actionForm(page, manage, 'Restore batch');
  await expect(restoreAfterDonateForm).toHaveCount(1);
  await restoreAfterDonateForm.getByLabel(/Restored amount/u).fill('5');
  await restoreAfterDonateForm.getByRole('button', { name: 'Restore batch', exact: true }).click();
  await expectSaved(page, 'Batch restored.');
  await cards.first().getByRole('button', { name: 'Empty' }).click();
  await expectSaved(page, 'Item marked empty.');
  await cards.first().getByRole('button', { name: 'Undo' }).click();
  await expectSaved(page, 'Last action undone.');

  await page.getByPlaceholder('Search products, brands, or locations').fill('pantry beans');
  await expect(cards.first()).toBeVisible();
  await page.getByRole('combobox', { name: 'Group Pantry', exact: true }).selectOption('location');
  await expect(
    page.getByText(/Best-before quality date · 2027-09-30 · estimated/u).first(),
  ).toBeVisible();
  expect((await new AxeBuilder({ page }).analyze()).violations).toEqual([]);
  await capture(page, testInfo, 'pantry-management-desktop');

  for (const [width, height, name] of [
    [834, 1112, 'tablet'],
    [390, 844, 'mobile'],
  ] as const) {
    await page.setViewportSize({ width, height });
    await page.reload();
    await expect(page.getByRole('heading', { name: 'Pantry', exact: true })).toBeVisible();
    expect(
      await page.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth),
    ).toBe(true);
    expect((await new AxeBuilder({ page }).analyze()).violations).toEqual([]);
    await capture(page, testInfo, `pantry-management-${name}`);
  }
  expect(browserErrors).toEqual([]);
});
