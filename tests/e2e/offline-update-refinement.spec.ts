import { expect, test, type Page } from '@playwright/test';
import { mkdirSync } from 'node:fs';
import { signInWorkflowFixture } from './helpers/onboarding';
import { appAxe } from './helpers/accessibility';

const directory = 'screenshots/full-refinement/offline';

async function announceUpdate(page: Page) {
  await page.evaluate(() => {
    navigator.serviceWorker.dispatchEvent(
      new MessageEvent('message', { data: { type: 'BORD_UPDATED', version: 'fixture-update' } }),
    );
    navigator.serviceWorker.dispatchEvent(new Event('controllerchange'));
  });
}

test('update events preserve a dirty form and reload only after an explicit clean-page action', async ({
  page,
}) => {
  test.setTimeout(90_000);
  mkdirSync(directory, { recursive: true });
  await page.setViewportSize({ width: 1440, height: 1000 });
  await signInWorkflowFixture(page);
  await page.goto('/recipes/new');
  await page.getByLabel('Recipe name', { exact: true }).fill('Retained unsaved update fixture');
  await page.evaluate(() => navigator.serviceWorker.ready.then(() => undefined));
  await expect(page.getByRole('button', { name: 'Reload when ready', exact: true })).toHaveCount(0);
  let navigations = 0;
  let writes = 0;
  page.on('request', (request) => {
    if (request.isNavigationRequest() && request.frame() === page.mainFrame()) navigations += 1;
    if (request.method() !== 'GET' && new URL(request.url()).pathname.startsWith('/api/v1/recipes'))
      writes += 1;
  });
  await announceUpdate(page);
  await announceUpdate(page);
  const notice = page.getByRole('status').filter({ hasText: 'Bòrd update ready.' });
  await expect(notice).toBeVisible();
  await expect(page.getByLabel('Recipe name', { exact: true })).toHaveValue(
    'Retained unsaved update fixture',
  );
  expect(navigations).toBe(0);
  expect(writes).toBe(0);
  await page.screenshot({ path: `${directory}/update-dirty-1440.png` });
  await page.setViewportSize({ width: 390, height: 500 });
  await page.getByLabel('Recipe name', { exact: true }).focus();
  await expect(page.getByLabel('Recipe name', { exact: true })).toBeFocused();
  expect((await appAxe(page).analyze()).violations).toEqual([]);
  await page.screenshot({ path: `${directory}/update-dirty-390x500.png` });
  // Leave this deliberately unsaved fixture, then adopt the update on a clean page.
  page.once('dialog', (dialog) => dialog.accept());
  await page.goto('/recipes');
  await expect(
    page.getByRole('heading', { name: 'Your recipe library', exact: true }),
  ).toBeVisible();
  await announceUpdate(page);
  const beforeReload = navigations;
  const reloaded = page.waitForEvent('framenavigated', (frame) => frame === page.mainFrame());
  await page.getByRole('button', { name: 'Reload when ready', exact: true }).click();
  await reloaded;
  await expect(
    page.getByRole('heading', { name: 'Your recipe library', exact: true }),
  ).toBeVisible();
  // The heading is server-rendered. Wait for the actual client update handoff
  // before delivering another worker event, rather than racing hydration.
  await expect(page.getByText(/^Bòrd updated to /)).toBeVisible();
  await announceUpdate(page);
  await expect(page.getByRole('button', { name: 'Reload when ready', exact: true })).toBeVisible();
  expect(navigations).toBe(beforeReload + 1);
  expect(writes).toBe(0);
});

test('browser online is not server recovery and retry opens only a reachable destination', async ({
  page,
}) => {
  test.setTimeout(90_000);
  mkdirSync(directory, { recursive: true });
  await signInWorkflowFixture(page);
  let reachable = false;
  let healthChecks = 0;
  let destinationChecks = 0;
  let writes = 0;
  await page.route('**/api/v1/health', async (route) => {
    healthChecks += 1;
    await route.fulfill({
      status: reachable ? 200 : 503,
      json: { status: reachable ? 'ok' : 'unavailable' },
    });
  });
  page.on('request', (request) => {
    if (request.headers()['x-bord-recovery-check'] === '1') destinationChecks += 1;
    if (request.method() !== 'GET' && new URL(request.url()).pathname.startsWith('/api/v1/'))
      writes += 1;
  });
  await page.setViewportSize({ width: 390, height: 844 });
  await page.goto('/offline?returnTo=%2Frecipes');
  expect(await page.evaluate(() => navigator.onLine)).toBe(true);
  await expect(page.locator('.offline-read-only-banner')).toContainText('Kitchen unavailable.');
  await page.getByRole('button', { name: 'Try again', exact: true }).click();
  await expect(page.getByRole('main').getByRole('status')).toContainText('still unavailable');
  expect(destinationChecks).toBe(0);
  await page.screenshot({ path: `${directory}/online-server-unavailable-390.png` });
  expect((await appAxe(page).analyze()).violations).toEqual([]);
  reachable = true;
  await page.getByRole('button', { name: 'Try again', exact: true }).click();
  await expect(page).toHaveURL('/recipes');
  await expect(
    page.getByRole('heading', { name: 'Your recipe library', exact: true }),
  ).toBeVisible();
  expect(healthChecks).toBeGreaterThanOrEqual(2);
  expect(destinationChecks).toBe(1);
  expect(writes).toBe(0);
});
