import { test, expect } from '@playwright/test';
import { completeInitialOnboarding } from './helpers/onboarding';
import { appAxe } from './helpers/accessibility';

test('AI defaults, account overrides, and bulk import remain usable on mobile and desktop', async ({
  page,
}, testInfo) => {
  test.setTimeout(180_000);
  const errors: string[] = [];
  page.on('pageerror', (error) => errors.push(error.message));
  await page.setViewportSize({ width: 390, height: 844 });
  await completeInitialOnboarding(page, 'AI settings browser fixture', 'Maya');
  await page.goto('/settings/ai');
  await expect(
    page.getByRole('heading', { name: 'Global AI settings', exact: true }),
  ).toBeVisible();
  await expect(page.getByLabel('Generations per 10 minutes', { exact: true })).toHaveValue('10');
  await expect(page.getByLabel('Batch item threshold')).toHaveValue('2');
  await page.getByLabel('Generations per 10 minutes', { exact: true }).fill('12');
  await page.getByRole('button', { name: 'Save global AI settings' }).click();
  await expect(page.getByRole('status').filter({ hasText: 'AI settings saved' })).toBeVisible();
  await page.reload();
  await expect(page.getByLabel('Generations per 10 minutes', { exact: true })).toHaveValue('12');
  await page.getByLabel('Generations per 10 minutes', { exact: true }).fill('10');
  await page.getByRole('button', { name: 'Save global AI settings' }).click();
  await expect(page.getByRole('status').filter({ hasText: 'AI settings saved' })).toBeVisible();
  for (const width of [320, 390, 1440]) {
    await page.setViewportSize({ width, height: 900 });
    expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(
      true,
    );
  }
  await page.setViewportSize({ width: 390, height: 844 });
  await page.evaluate(() => window.scrollTo(0, 0));
  await page.screenshot({ path: testInfo.outputPath('global-ai-mobile.png') });
  expect((await appAxe(page).analyze()).violations).toEqual([]);
  await page.goto('/account/ai');
  await expect(page.getByLabel('Use global processing defaults')).toBeChecked();
  await page.getByLabel('Use global processing defaults').uncheck();
  await page.getByLabel('Processing', { exact: true }).selectOption('direct');
  await page.getByRole('button', { name: 'Save my AI defaults' }).click();
  await expect(page.getByRole('status').filter({ hasText: 'AI settings saved' })).toBeVisible();
  await page.reload();
  await expect(page.getByLabel('Processing', { exact: true })).toHaveValue('direct');
  await page.getByLabel('Use global processing defaults').check();
  await page.getByRole('button', { name: 'Save my AI defaults' }).click();
  await expect(page.getByRole('status').filter({ hasText: 'AI settings saved' })).toBeVisible();
  await page.goto('/?add=recipe');
  await page.getByRole('link', { name: 'Bulk add recipes', exact: true }).click();
  await expect(page.getByRole('heading', { name: 'Bulk add recipes', exact: true })).toBeVisible();
  await page
    .getByLabel('Recipe prompts', { exact: true })
    .fill('A quick chickpea curry\n\nA lemon drizzle cake');
  await page.getByLabel('Recipe URLs', { exact: true }).fill('https://recipes.example.test/soup');
  await page.getByLabel('Recipe images').setInputFiles({
    name: 'recipe.png',
    mimeType: 'image/png',
    buffer: Buffer.from(
      'iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mP8/x8AAwMCAO+aN1cAAAAASUVORK5CYII=',
      'base64',
    ),
  });
  await expect(page.getByRole('heading', { name: '4 recipes ready to import' })).toBeVisible();
  expect(await page.getByRole('button', { name: 'Import 4 recipes' }).isDisabled()).toBe(true);
  for (const width of [320, 390, 1440]) {
    await page.setViewportSize({ width, height: 900 });
    expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(
      true,
    );
  }
  await page.setViewportSize({ width: 390, height: 844 });
  await page.evaluate(() => window.scrollTo(0, 0));
  await page.screenshot({ path: testInfo.outputPath('bulk-import-mobile.png') });
  expect((await appAxe(page).analyze()).violations).toEqual([]);
  await page.emulateMedia({ colorScheme: 'dark' });
  await page.screenshot({ path: testInfo.outputPath('bulk-import-mobile-dark.png') });
  expect((await appAxe(page).analyze()).violations).toEqual([]);
  await page.route('**/api/v1/ai/imports', async (route) => {
    const body = route.request().postDataJSON();
    expect(body.confirmPaid).toBe(true);
    expect(body.sources.map((source: { kind: string }) => source.kind)).toEqual([
      'prompt',
      'prompt',
      'url',
      'image',
    ]);
    await route.fulfill({
      status: 202,
      json: { job: { id: 'mock-job', totalItems: 4, executionMode: 'batch' } },
    });
  });
  await page.getByLabel('Allow this paid AI import', { exact: true }).check();
  await page.getByRole('button', { name: 'Import 4 recipes' }).click();
  await expect(page.getByRole('heading', { name: '4 recipes queued' })).toBeVisible();
  await expect(page.getByRole('link', { name: 'View progress and review drafts' })).toBeVisible();
  expect(errors).toEqual([]);
});
