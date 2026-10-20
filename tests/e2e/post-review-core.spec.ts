import { expect, test } from '@playwright/test';
import { mkdirSync, writeFileSync } from 'node:fs';
import { execFileSync } from 'node:child_process';
import { signInWorkflowFixture } from './helpers/onboarding';
import { appAxe } from './helpers/accessibility';
const directory = 'screenshots/post-review/core';
test.afterAll(() => {
  mkdirSync(directory, { recursive: true });
  writeFileSync(
    `${directory}/manifest.json`,
    JSON.stringify(
      {
        revision: execFileSync('git', ['rev-parse', 'HEAD'], { encoding: 'utf8' }).trim(),
        state:
          'Working post-review code: synthetic account, real context service; verification delivery intercepted',
        capturedAt: new Date().toISOString(),
      },
      null,
      2,
    ),
  );
});
test('effective food policy is readable and does not expose server credentials', async ({
  page,
}) => {
  await signInWorkflowFixture(page);
  await page.goto('/settings/system#food-providers');
  const section = page.locator('#food-providers');
  await section.getByText('Effective food-data configuration', { exact: true }).click();
  await expect(
    section.getByText(/Remote fallback · FOOD_DATA_ALLOW_REMOTE_FALLBACK/),
  ).toBeVisible();
  await expect(section.getByText(/Quotas are configured request ceilings/)).toBeVisible();
  for (const width of [1440, 390]) {
    await page.setViewportSize({ width, height: 1000 });
    await section
      .getByText('Effective food-data configuration', { exact: true })
      .scrollIntoViewIfNeeded();
    await page.screenshot({ path: `${directory}/effective-food-policy-${width}.png` });
  }
  expect((await appAxe(page).include('#food-providers').analyze()).violations).toEqual([]);
});
test('guided interview resumes and saves only deliberately edited answers', async ({ page }) => {
  await signInWorkflowFixture(page);
  const prior = await (await page.request.get('/api/v1/account/kitchen-context')).json();
  const saved = await page.request.patch('/api/v1/account/kitchen-context', {
    headers: { Origin: 'http://127.0.0.1:3100' },
    data: { interviewPatch: { taste: 'Existing savory answer' }, expectedRevision: prior.revision },
  });
  expect(saved.ok()).toBe(true);
  await page.goto('/account');
  await page.getByRole('button', { name: 'Edit guided questionnaire' }).click();
  await expect(
    page.getByRole('heading', { name: 'Review kitchen context for Maya' }),
  ).toBeVisible();
  await page.getByRole('button', { name: 'Edit routine', exact: true }).click();
  await page.getByRole('button', { name: 'Shared dinners', exact: true }).click();
  const answer = page.getByLabel('Which meals do you share with your household?', { exact: true });
  await expect(answer).toHaveValue('Shared dinners');
  await answer.fill('Shared dinners; one oven and twenty minutes on weekdays.');
  await page.getByRole('button', { name: 'Continue', exact: true }).click();
  await page.getByRole('button', { name: 'Close', exact: true }).click();
  await expect(page.getByText(/Unsaved questionnaire answers are retained/)).toBeVisible();
  await page.getByRole('button', { name: 'Resume unsaved questionnaire', exact: true }).click();
  await page.getByRole('button', { name: 'Back', exact: true }).click();
  await expect(answer).toHaveValue('Shared dinners; one oven and twenty minutes on weekdays.');
  await page.setViewportSize({ width: 390, height: 844 });
  await answer.focus();
  await page.screenshot({ path: `${directory}/interview-resumed-390.png` });
  for (let i = 0; i < 3; i++)
    await page.getByRole('button', { name: 'Continue', exact: true }).click();
  await page.setViewportSize({ width: 1440, height: 1000 });
  await page.getByRole('button', { name: 'Save context', exact: true }).scrollIntoViewIfNeeded();
  await page.screenshot({ path: `${directory}/interview-review-1440.png` });
  await page.getByRole('button', { name: 'Save context', exact: true }).click();
  await expect(page.getByText(/Your kitchen context is saved/)).toBeVisible();
  const result = await (await page.request.get('/api/v1/account/kitchen-context')).json();
  expect(result.interview).toMatchObject({
    taste: 'Existing savory answer',
    routine: 'Shared dinners; one oven and twenty minutes on weekdays.',
  });
});
test('invalid verification links have a local request and truthful accepted/error states', async ({
  page,
}) => {
  let release!: () => void;
  let fail = false;
  await page.route('**/api/auth/send-verification-email', async (route) => {
    if (fail)
      return route.fulfill({ status: 503, json: { message: 'Controlled email request outage.' } });
    await new Promise<void>((resolve) => {
      release = resolve;
    });
    return route.fulfill({ json: { status: true } });
  });
  await page.setViewportSize({ width: 390, height: 844 });
  await page.goto('/verify-email?invalid=1');
  await expect(page.getByRole('heading', { name: 'Request a verification link' })).toBeVisible();
  await expect(page.getByRole('banner')).toHaveCount(0);
  await page.getByLabel('Email', { exact: true }).fill('synthetic@example.test');
  await page.getByRole('button', { name: 'Request verification link', exact: true }).click();
  await expect(page.getByLabel('Email', { exact: true })).toBeDisabled();
  await page.screenshot({ path: `${directory}/verification-request-pending-390.png` });
  release();
  await expect(page.getByText(/Request received for synthetic@example.test/)).toBeVisible();
  await page.screenshot({ path: `${directory}/verification-request-accepted-390.png` });
  await page.getByLabel('Email', { exact: true }).fill('other@example.test');
  await expect(page.getByText(/Request received for/)).toHaveCount(0);
  fail = true;
  await page.getByRole('button', { name: 'Request verification link', exact: true }).click();
  await expect(page.locator('.auth-feedback[role="alert"]')).toContainText(
    'Controlled email request outage.',
  );
  await page.setViewportSize({ width: 1440, height: 1000 });
  await page.screenshot({ path: `${directory}/verification-request-failure-1440.png` });
  expect((await appAxe(page).analyze()).violations).toEqual([]);
});

test('reviewed cart amount stays independent of demand in the populated editor', async ({
  page,
}) => {
  await signInWorkflowFixture(page);
  const headers = { Origin: 'http://127.0.0.1:3100' };
  const productResponse = await page.request.post('/api/v1/pantry/products', {
    headers,
    data: { displayName: `Cart fixture ${Date.now()}`, defaultInventoryUnit: 'g' },
  });
  expect(productResponse.ok()).toBe(true);
  const { product } = await productResponse.json();
  const listResponse = await page.request.post('/api/v1/shopping-lists', {
    headers,
    data: { kind: 'manual', name: 'Purchase dimension fixture' },
  });
  expect(listResponse.ok()).toBe(true);
  const { list } = await listResponse.json();
  const itemResponse = await page.request.post(`/api/v1/shopping-lists/${list.id}/items`, {
    headers,
    data: {
      item: 'Reviewed food',
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
  const confirmed = await page.request.post(`/api/v1/shopping-lists/${list.id}/catalog-items`, {
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
  expect(confirmed.ok()).toBe(true);
  await page.setViewportSize({ width: 390, height: 844 });
  await page.goto(`/lists/${list.id}`);
  await page.getByRole('button', { name: 'Shopping mode', exact: true }).click();
  await expect(page.getByText('500 g in cart', { exact: true })).toBeVisible();
  await expect(page.getByText('500 each', { exact: false })).toHaveCount(0);
  const current = await (await page.request.get(`/api/v1/shopping-lists/${list.id}`)).json();
  expect(current.list.items[0]).toMatchObject({
    quantity: 2,
    unit: 'each',
    cartQuantity: 500,
    cartUnit: 'g',
  });
  await page.getByRole('button', { name: 'Change quantity', exact: true }).click();
  await expect(page.getByLabel('Quantity bought', { exact: true })).toHaveValue('500');
  await expect(page.getByLabel('Purchase unit', { exact: true })).toHaveValue('g');
  await page.screenshot({ path: `${directory}/purchase-versus-demand-390.png` });
});
