import { expect, test } from '@playwright/test';
import { mkdirSync, writeFileSync } from 'node:fs';
import { execFileSync } from 'node:child_process';
import { signInWorkflowFixture } from './helpers/onboarding';
import { appAxe } from './helpers/accessibility';

const directory = 'screenshots/post-review/chat';
test('text commands and interruption recovery stay readable in constrained chat layouts', async ({
  page,
}) => {
  test.setTimeout(180_000);
  await signInWorkflowFixture(page);
  let reviewed = false;
  let uncertain = false;
  const threadId = '00000000-0000-4000-8000-000000000777';
  const operationId = '00000000-0000-4000-8000-000000000778';
  await page.route('**/api/v1/ai/chat/threads', (route) =>
    route.fulfill({ json: { threads: [{ id: threadId, title: 'Controlled layout review' }] } }),
  );
  await page.route(`**/api/v1/ai/chat/threads/${threadId}`, async (route) => {
    if (route.request().method() === 'PATCH') {
      expect(route.request().postDataJSON()).toEqual({
        action: 'acknowledge_recovery',
        operationId,
      });
      reviewed = true;
      return route.fulfill({ json: { acknowledged: true } });
    }
    return route.fulfill({
      json: {
        messages: Array.from({ length: 18 }, (_, i) => ({
          id: String(i),
          role: 'assistant',
          content: `Synthetic message ${i + 1}: review meals and quantities before applying changes.`,
        })),
        actions: [],
        jobs: [],
        turns: uncertain ? [{ id: operationId, status: 'outcome_unknown', reviewed }] : [],
      },
    });
  });
  await page.route('**/api/v1/ai/app-actions?*', (route) =>
    route.fulfill({ json: { proposals: [] } }),
  );
  await page.addInitScript(() => {
    const original = window.fetch.bind(window);
    const fixture = window as unknown as {
      chatLayout: { emit: (event: object, close?: boolean) => void };
    };
    fixture.chatLayout = { emit: () => undefined };
    window.fetch = async (input, init) => {
      const url = typeof input === 'string' ? input : input instanceof URL ? input.href : input.url;
      if (/\/ai\/chat\/threads\/[^/]+\/messages$/u.test(url) && init?.method === 'POST') {
        let sequence = 0;
        const stream = new ReadableStream<Uint8Array>({
          start(controller) {
            fixture.chatLayout.emit = (event, close = false) => {
              controller.enqueue(
                new TextEncoder().encode(`${JSON.stringify({ sequence: ++sequence, ...event })}\n`),
              );
              if (close) controller.close();
            };
            init.signal?.addEventListener(
              'abort',
              () => controller.error(new DOMException('Stopped by user', 'AbortError')),
              { once: true },
            );
            fixture.chatLayout.emit({ type: 'status', message: 'Preparing a response…' });
            fixture.chatLayout.emit({
              type: 'text',
              delta: 'A genuinely progressive controlled fragment.',
            });
          },
        });
        return new Response(stream, { headers: { 'Content-Type': 'application/x-ndjson' } });
      }
      return original(input, init);
    };
  });
  await page.goto('/');
  await page.getByRole('button', { name: 'Open AI assistant' }).click();
  const dialog = page.getByRole('dialog', { name: 'Kitchen assistant' });
  const composer = dialog.getByRole('textbox', { name: 'Message the AI assistant' });
  await composer.fill('Controlled layout request');
  await dialog.getByRole('button', { name: 'Send message' }).click();
  const stop = dialog.getByRole('button', { name: 'Stop generating' });
  await expect(stop).toBeVisible();
  mkdirSync(directory, { recursive: true });
  for (const [width, height, scale] of [
    [1440, 1000, 1],
    [390, 844, 1],
    [320, 568, 1],
    [320, 568, 2],
    [390, 500, 1],
    [568, 320, 1],
  ]) {
    await page.setViewportSize({ width, height });
    await page.evaluate((scale) => {
      document.documentElement.style.fontSize = `${scale * 100}%`;
    }, scale);
    await expect(
      dialog.getByText('A genuinely progressive controlled fragment.', { exact: true }),
    ).toBeInViewport();
    await stop.focus();
    await stop.scrollIntoViewIfNeeded();
    await expect(stop).toBeFocused();
    await expect(stop).toBeInViewport();
    expect(await stop.evaluate((el) => el.scrollWidth <= el.clientWidth + 1)).toBe(true);
    const rect = await stop.boundingBox();
    expect(rect!.width).toBeGreaterThan(100);
    expect(rect!.height).toBeGreaterThanOrEqual(44);
    expect(await dialog.evaluate((el) => el.scrollWidth <= el.clientWidth + 1)).toBe(true);
    const messageArea = await dialog.locator('[data-chat-messages]').boundingBox();
    expect(messageArea).not.toBeNull();
    expect(messageArea!.height).toBeGreaterThanOrEqual(Math.min(80, height * 0.2));
    await page.screenshot({ path: `${directory}/running-${width}x${height}-${scale}x.png` });
  }
  await page.setViewportSize({ width: 390, height: 500 });
  await stop.click();
  await expect(stop).toHaveCount(0);
  await expect(dialog.getByRole('button', { name: 'Check the same request' })).toBeVisible();
  await page.screenshot({ path: `${directory}/stopped-recovery.png` });
  uncertain = true;
  await dialog.getByRole('button', { name: 'Review current conversation' }).click();
  await expect(dialog.getByRole('button', { name: 'Send message' })).toBeDisabled();
  const acknowledge = dialog.getByRole('button', { name: 'I reviewed the saved outcomes' });
  await acknowledge.scrollIntoViewIfNeeded();
  await expect(acknowledge).toBeInViewport();
  expect(await acknowledge.evaluate((el) => el.scrollWidth <= el.clientWidth + 1)).toBe(true);
  await page.screenshot({ path: `${directory}/unknown-owned-review.png` });
  await acknowledge.click();
  expect(reviewed).toBe(true);
  await composer.fill('A separate deliberate next request');
  await expect(dialog.getByRole('button', { name: 'Send message' })).toBeEnabled();
  await dialog.getByRole('button', { name: 'Send message' }).click();
  await expect(stop).toBeVisible();
  await page.setViewportSize({ width: 320, height: 568 });
  await dialog.locator('[data-chat-messages]').evaluate((element) => {
    element.scrollTop = 0;
    element.dispatchEvent(new Event('scroll'));
  });
  await page.evaluate(() => {
    (window as unknown as { chatLayout: { emit: (event: object) => void } }).chatLayout.emit({
      type: 'text',
      delta: ' More current output while you read earlier messages.',
    });
  });
  const jump = dialog.getByRole('button', { name: 'Jump to latest response', exact: true });
  await expect(jump).toBeVisible();
  await jump.focus();
  await expect(jump).toBeInViewport();
  expect(await jump.evaluate((element) => element.scrollWidth <= element.clientWidth + 1)).toBe(
    true,
  );
  await page.screenshot({ path: `${directory}/jump-to-latest-320.png` });
  await jump.click();
  await expect(jump).toHaveCount(0);
  await page.evaluate(() => {
    (
      window as unknown as { chatLayout: { emit: (event: object, close?: boolean) => void } }
    ).chatLayout.emit(
      { type: 'error', message: 'Controlled provider failure. Review this request.' },
      true,
    );
  });
  await page.setViewportSize({ width: 390, height: 500 });
  await expect(dialog.getByRole('alert')).toContainText('Controlled provider failure.');
  const retry = dialog.getByRole('button', { name: 'Check the same request', exact: true });
  await retry.focus();
  await expect(retry).toBeInViewport();
  await page.screenshot({ path: `${directory}/failed-owned-recovery-390.png` });
  await retry.click();
  await page.setViewportSize({ width: 568, height: 320 });
  await expect(stop).toBeVisible();
  await expect(stop).toBeInViewport();
  await page.screenshot({ path: `${directory}/checking-same-request-568.png` });
  await page.evaluate(() => {
    (
      window as unknown as { chatLayout: { emit: (event: object, close?: boolean) => void } }
    ).chatLayout.emit(
      { type: 'done', content: 'Controlled recovered response.', messageId: 'recovered' },
      true,
    );
  });
  await expect(dialog.getByText('Response ready.', { exact: true })).toBeVisible();
  expect((await appAxe(page).include('[role="dialog"]').analyze()).violations).toEqual([]);
  writeFileSync(
    `${directory}/manifest.json`,
    JSON.stringify(
      {
        baseCommit: execFileSync('git', ['rev-parse', 'HEAD'], { encoding: 'utf8' }).trim(),
        state: 'Working post-review code; deterministic HTTP/stream fixture, no paid calls',
        capturedAt: new Date().toISOString(),
        browser: 'Chromium',
        viewports: [
          '1440x1000',
          '390x844',
          '320x568',
          '320x568 with200%text',
          '390x500',
          '568x320',
        ],
      },
      null,
      2,
    ),
  );
});
