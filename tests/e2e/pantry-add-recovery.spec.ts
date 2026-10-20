import { expect, test } from '@playwright/test';
import { signInWorkflowFixture } from './helpers/onboarding';

test('manual Pantry addition resumes the uncertain batch and preserves newer form edits', async ({
  page,
}, testInfo) => {
  test.setTimeout(120_000);
  await signInWorkflowFixture(page);
  const response = await page.request.post('/api/v1/pantry/products', {
    headers: { Origin: 'http://127.0.0.1:3100' },
    data: {
      displayName: `Batch recovery fixture ${Date.now()}`,
      defaultInventoryUnit: 'g',
      defaultStorageType: 'pantry',
    },
  });
  expect(response.ok()).toBe(true);
  const { product } = await response.json();
  const attempts: { key: string; amount: number }[] = [];
  const committed = new Map<string, string>();
  let lostResponse = false;
  let failSummary = false;
  await page.route('**/api/v1/pantry/summary**', async (route) => {
    if (!failSummary) return route.continue();
    failSummary = false;
    return route.fulfill({
      status: 503,
      json: { error: { message: 'Controlled summary outage' } },
    });
  });
  await page.route('**/api/v1/pantry/batches', async (route) => {
    if (route.request().method() !== 'POST') return route.continue();
    const key = route.request().headers()['idempotency-key']!;
    const amount = route.request().postDataJSON().quantityRemaining;
    expect(key).toBeTruthy();
    attempts.push({ key, amount });
    if (!committed.has(key)) committed.set(key, `controlled-batch-${committed.size + 1}`);
    if (committed.size === 2 && !lostResponse) {
      lostResponse = true;
      failSummary = true;
      return route.abort('failed');
    }
    return route.fulfill({ json: { batch: { id: committed.get(key) } } });
  });
  await page.goto('/pantry');
  await page.getByRole('button', { name: 'Add item', exact: true }).click();
  const dialog = page.getByRole('dialog', { name: 'Add pantry item' });
  await dialog.getByRole('button', { name: 'Enter details manually', exact: true }).click();
  await dialog
    .getByRole('combobox', { name: 'Existing product', exact: true })
    .selectOption(product.id);
  await dialog.getByLabel('Quantity', { exact: true }).fill('250');
  await dialog.getByLabel('Separate batches', { exact: true }).fill('3');
  await dialog.getByRole('button', { name: 'Add item', exact: true }).click();
  const recovery = dialog.getByRole('region', { name: 'Pantry addition recovery' });
  await expect(recovery).toContainText('1 of 3 batches confirmed.');
  await expect(recovery.getByRole('button', { name: 'Resume this addition' })).toBeDisabled();
  await recovery.getByRole('button', { name: 'Refresh Pantry' }).click();
  await expect(recovery.getByRole('button', { name: 'Resume this addition' })).toBeEnabled();
  await dialog.getByLabel('Quantity', { exact: true }).fill('999');
  for (const viewport of [
    { width: 390, height: 844 },
    { width: 1440, height: 1000 },
  ]) {
    await page.setViewportSize(viewport);
    await recovery.getByRole('button', { name: 'Resume this addition' }).focus();
    await expect(recovery.getByRole('button', { name: 'Resume this addition' })).toBeInViewport();
    await page.screenshot({
      path: testInfo.outputPath(`pantry-add-uncertain-${viewport.width}.png`),
    });
  }
  await recovery.getByRole('button', { name: 'Resume this addition' }).click();
  await expect(recovery).toHaveCount(0, { timeout: 30_000 });
  await expect(dialog.getByLabel('Quantity', { exact: true })).toHaveValue('999');
  expect(attempts).toHaveLength(4);
  expect(attempts[2]).toEqual(attempts[1]);
  expect(attempts.every((attempt) => attempt.amount === 250)).toBe(true);
  expect(committed.size).toBe(3);
  await page.screenshot({ path: testInfo.outputPath('pantry-add-resumed-draft-preserved.png') });
});
