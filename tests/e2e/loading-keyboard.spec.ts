import { expect, test } from '@playwright/test';
import { completeInitialOnboarding } from './helpers/onboarding';
import { appAxe } from './helpers/accessibility';

test('delayed controls and assistant keyboard layout remain usable', async ({ page }) => {
  test.setTimeout(120_000);
  const errors: string[] = [];
  const consoleErrors: string[] = [];
  page.on('console', (message) => {
    if (message.type() === 'error') consoleErrors.push(message.text());
  });
  page.on('pageerror', (error) => errors.push(error.message));
  await page.setViewportSize({ width: 390, height: 844 });
  await completeInitialOnboarding(page, 'Loading review', 'Alex');

  let releaseTags!: () => void;
  const tags = new Promise<void>((resolve) => {
    releaseTags = resolve;
  });
  await page.route('**/api/v1/tags', async (route) => {
    await tags;
    await route.fulfill({ json: { tags: [{ name: 'weeknight' }] } });
  });
  await page.goto('/recipes/new');
  const tagLoading = page.getByRole('status', { name: 'Loading saved tag suggestions' });
  await expect(tagLoading).toBeVisible();
  await tagLoading.scrollIntoViewIfNeeded();
  await page.screenshot({ path: '/tmp/bord-loading-tags-mobile.png', caret: 'initial' });
  releaseTags();
  await expect(tagLoading).toHaveCount(0);
  await page.getByRole('button', { name: 'weeknight', exact: true }).click();
  await expect(page.getByLabel('Selected recipe tags')).toContainText('weeknight');
  await page.goto('/account');
  await page.evaluate(() => window.scrollTo(0, 250));
  const scrollBefore = await page.evaluate(() => window.scrollY);

  let releaseHistory!: () => void;
  const history = new Promise<void>((resolve) => {
    releaseHistory = resolve;
  });
  await page.route('**/api/v1/ai/chat/threads', async (route) => {
    await history;
    await route.fulfill({ json: { threads: [{ id: 'keyboard-test' }] } });
  });
  await page.route('**/api/v1/ai/chat/threads/keyboard-test', (route) =>
    route.fulfill({
      json: {
        messages: Array.from({ length: 30 }, (_, index) => ({
          id: `message-${index}`,
          role: index % 2 ? 'user' : 'assistant',
          content:
            index === 29
              ? 'Latest reply stays in view.'
              : `Kitchen message ${index + 1}. Let’s plan something useful for dinner.`,
        })),
        actions: [],
        jobs: [],
      },
    }),
  );
  await page.route('**/api/v1/ai/app-actions?*', (route) =>
    route.fulfill({ json: { proposals: [] } }),
  );
  await page.getByRole('button', { name: 'Open AI assistant', exact: true }).click();
  const dialog = page.getByRole('dialog', { name: 'Kitchen assistant' });
  await expect(dialog.getByRole('status', { name: 'Loading your conversation…' })).toBeVisible();
  await expect(dialog.getByLabel('Message the AI assistant')).toBeDisabled();
  await page.screenshot({ path: '/tmp/bord-loading-chat-mobile.png' });
  releaseHistory();
  await expect(dialog.getByText('Latest reply stays in view.')).toBeVisible();
  const list = dialog.locator('div[aria-live="polite"]').first();
  await expect
    .poll(() => list.evaluate((el) => el.scrollHeight - el.scrollTop - el.clientHeight))
    .toBeLessThan(2);

  // Deterministic visual-viewport simulation: this does not emulate a physical iOS keyboard.
  await page.evaluate(() => {
    const state = { height: 844, top: 0 };
    Object.assign(window, { keyboardTestViewport: state });
    Object.defineProperties(window.visualViewport!, {
      height: { configurable: true, get: () => state.height },
      offsetTop: { configurable: true, get: () => state.top },
    });
  });
  for (const width of [320, 390, 1440]) {
    await page.setViewportSize({ width, height: 844 });
    for (const theme of ['light', 'dark']) {
      await page.evaluate(
        ({ theme }) => {
          document.documentElement.dataset.theme = theme;
          document.documentElement.style.colorScheme = theme;
          const state = (
            window as unknown as { keyboardTestViewport: { height: number; top: number } }
          ).keyboardTestViewport;
          state.height = 430;
          state.top = 34;
          window.visualViewport!.dispatchEvent(new Event('resize'));
        },
        { theme },
      );
      const input = dialog.getByLabel('Message the AI assistant');
      await input.fill('Help me plan dinner.\nKeep it simple.');
      await expect(dialog).toHaveAttribute('data-keyboard-open', 'true');
      const shell = await dialog.boundingBox();
      const composer = await dialog
        .getByRole('form', { name: 'AI assistant message composer' })
        .boundingBox();
      expect(shell!.y + shell!.height).toBeGreaterThanOrEqual(844);
      expect(composer!.y + composer!.height).toBeLessThanOrEqual(464);
      expect(composer!.x).toBeGreaterThanOrEqual(0);
      expect(composer!.x + composer!.width).toBeLessThanOrEqual(width);
      await expect
        .poll(() => list.evaluate((el) => el.scrollHeight - el.scrollTop - el.clientHeight))
        .toBeLessThan(2);
      expect(await page.evaluate(() => document.body.style.position)).toBe('fixed');
      expect(
        await page.evaluate(() => {
          const el = document.elementFromPoint(window.innerWidth - 10, 820);
          return Boolean(el?.closest('[role="dialog"]'));
        }),
      ).toBe(true);
      expect((await appAxe(page).include('[role="dialog"]').analyze()).violations).toEqual([]);
      await page.screenshot({ path: `/tmp/bord-chat-keyboard-${width}-${theme}.png` });
    }
  }
  await list.evaluate((el) => {
    el.scrollTop = 80;
    el.dispatchEvent(new Event('scroll'));
  });
  await page.evaluate(() => {
    const state = (window as unknown as { keyboardTestViewport: { height: number; top: number } })
      .keyboardTestViewport;
    state.height = 390;
    state.top = 60;
    window.visualViewport!.dispatchEvent(new Event('scroll'));
  });
  await expect.poll(() => list.evaluate((el) => el.scrollTop)).toBe(80);
  await page.evaluate(() => {
    const state = (window as unknown as { keyboardTestViewport: { height: number; top: number } })
      .keyboardTestViewport;
    state.height = 844;
    state.top = 0;
    window.visualViewport!.dispatchEvent(new Event('resize'));
  });
  await expect(dialog).toHaveAttribute('data-keyboard-open', 'false');
  await dialog.getByRole('button', { name: 'Close AI assistant' }).click();
  await expect(dialog).toHaveCount(0);
  await expect.poll(() => page.evaluate(() => window.scrollY)).toBe(scrollBefore);
  expect(await page.evaluate(() => document.body.style.position)).toBe('');
  await page.getByRole('button', { name: 'Open AI assistant', exact: true }).click();
  await expect(page.getByLabel('Message the AI assistant')).toHaveValue(
    'Help me plan dinner.\nKeep it simple.',
  );
  expect(errors).toEqual([]);
  expect(consoleErrors).toEqual([]);
});
