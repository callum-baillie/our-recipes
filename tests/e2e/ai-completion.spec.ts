import { expect, test } from '@playwright/test';
import { mkdirSync, writeFileSync } from 'node:fs';
import { execFileSync } from 'node:child_process';
import { signInWorkflowFixture } from './helpers/onboarding';
import { appAxe } from './helpers/accessibility';
const directory = 'screenshots/full-refinement/ai';
test('administrator guidance validates variables, retains conflicts and stays readable', async ({
  page,
}) => {
  test.setTimeout(120_000);
  await signInWorkflowFixture(page);
  await page.goto('/settings/ai#prompt-guidance');
  const pane = page.locator('#prompt-guidance');
  const editor = pane.locator('details.settings-subsection').first();
  await editor.locator(':scope > summary').click();
  const guidance = editor.getByLabel(/^Task guidance/);
  await guidance.fill('Invalid guidance without its variable.');
  await editor.getByLabel('Reason for this version').fill('Controlled review');
  const save = editor.getByRole('button', { name: 'Save Kitchen Assistant guidance' });
  await expect(save).toBeDisabled();
  await expect(editor.getByText('Include the required {{task}} variable.')).toBeVisible();
  await guidance.fill('For {{task}}, answer briefly and preserve evidence limitations.');
  await page.route('**/api/v1/ai/prompts', async (route) => {
    if (route.request().method() === 'PUT')
      return route.fulfill({
        status: 409,
        json: {
          error: { message: 'Controlled prompt version conflict. Compare the current guidance.' },
        },
      });
    return route.continue();
  });
  await save.click();
  await expect(
    editor.getByText('Controlled prompt version conflict. Compare the current guidance.'),
  ).toBeVisible();
  await expect(guidance).toHaveValue(
    'For {{task}}, answer briefly and preserve evidence limitations.',
  );
  mkdirSync(directory, { recursive: true });
  const recovery = editor.getByRole('button', {
    name: 'Load current version to compare',
    exact: true,
  });
  await expect(save).toBeDisabled();
  await expect(recovery).toBeEnabled();
  for (const viewport of [
    { width: 1440, height: 1000 },
    { width: 390, height: 844 },
    { width: 320, height: 568 },
  ]) {
    await page.setViewportSize(viewport);
    await recovery.focus();
    // Re-enter through keyboard navigation after reflow, even when the action
    // was already focused at the previous width (focus() then emits no event).
    await page.keyboard.press('Shift+Tab');
    await page.keyboard.press('Tab');
    await expect(recovery).toBeFocused();
    await expect(recovery).toBeInViewport();
    expect(
      await page.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth),
    ).toBe(true);
    await page.screenshot({ path: `${directory}/prompt-conflict-${viewport.width}.png` });
  }
  expect((await appAxe(page).include('#prompt-guidance').analyze()).violations).toEqual([]);
});
test('progressive chat owns pending, preserves the next draft and reconciles an exact retry', async ({
  page,
}) => {
  test.setTimeout(180_000);
  await signInWorkflowFixture(page);
  await page.addInitScript(() => {
    const original = window.fetch.bind(window);
    const fixture = window as unknown as {
      bordChat: {
        requests: Record<string, unknown>[];
        emit: (event: Record<string, unknown>, close?: boolean) => void;
      };
    };
    fixture.bordChat = { requests: [], emit: () => undefined };
    window.fetch = async (input, init) => {
      const url = typeof input === 'string' ? input : input instanceof URL ? input.href : input.url;
      if (/\/ai\/chat\/threads\/[^/]+\/messages$/u.test(url) && init?.method === 'POST') {
        fixture.bordChat.requests.push(JSON.parse(String(init.body)));
        let sequence = 0;
        const stream = new ReadableStream<Uint8Array>({
          start(controller) {
            fixture.bordChat.emit = (event, close = false) => {
              controller.enqueue(
                new TextEncoder().encode(`${JSON.stringify({ sequence: ++sequence, ...event })}\n`),
              );
              if (close) controller.close();
            };
            fixture.bordChat.emit({ type: 'status', message: 'Preparing a response…' });
            fixture.bordChat.emit({ type: 'text', delta: 'The first visible fragment' });
          },
        });
        return new Response(stream, { headers: { 'Content-Type': 'application/x-ndjson' } });
      }
      return original(input, init);
    };
  });
  await page.setViewportSize({ width: 1440, height: 1000 });
  await page.goto('/');
  const opener = page.getByRole('button', { name: 'Open AI assistant' });
  await opener.click();
  const dialog = page.getByRole('dialog', { name: 'Kitchen assistant' });
  const composer = dialog.getByRole('textbox', { name: 'Message the AI assistant' });
  await expect(composer).toBeEnabled({ timeout: 30_000 });
  await composer.fill('Explain my synthetic dinner options.');
  await dialog.getByRole('button', { name: 'Send message' }).click();
  await expect(dialog.getByText('The first visible fragment', { exact: true })).toBeVisible();
  await expect(dialog.getByRole('button', { name: 'Stop generating' })).toBeVisible();
  await composer.fill('Keep this unsent next question.');
  mkdirSync(directory, { recursive: true });
  await page.screenshot({ path: `${directory}/chat-progress-desktop.png` });
  await page.evaluate(() =>
    (
      window as unknown as {
        bordChat: { emit: (event: Record<string, unknown>, close?: boolean) => void };
      }
    ).bordChat.emit(
      {
        type: 'done',
        messageId: 'fixture-final',
        content: 'The first visible fragment and the completed response.',
      },
      true,
    ),
  );
  await expect(
    dialog.getByText('The first visible fragment and the completed response.', { exact: true }),
  ).toBeVisible();
  await expect(composer).toHaveValue('Keep this unsent next question.');
  await expect(dialog.getByRole('button', { name: 'Stop generating' })).toHaveCount(0);
  await page.setViewportSize({ width: 390, height: 500 });
  await dialog.getByRole('button', { name: 'Send message' }).click();
  await expect(dialog.getByRole('button', { name: 'Stop generating' })).toBeVisible();
  await composer.fill('A later draft must survive the error.');
  await page.evaluate(() =>
    (
      window as unknown as {
        bordChat: { emit: (event: Record<string, unknown>, close?: boolean) => void };
      }
    ).bordChat.emit(
      { type: 'error', message: 'Controlled connection interruption. Review the conversation.' },
      true,
    ),
  );
  await expect(
    dialog.getByText('Controlled connection interruption. Review the conversation.'),
  ).toBeVisible();
  await expect(dialog.getByRole('button', { name: 'Send message' })).toBeDisabled();
  await dialog.getByRole('button', { name: 'Check the same request' }).click();
  const attempts = await page.evaluate(
    () =>
      (window as unknown as { bordChat: { requests: Record<string, unknown>[] } }).bordChat
        .requests,
  );
  expect(attempts).toHaveLength(3);
  expect(attempts[2]).toEqual(attempts[1]);
  await page.evaluate(() =>
    (
      window as unknown as {
        bordChat: { emit: (event: Record<string, unknown>, close?: boolean) => void };
      }
    ).bordChat.emit(
      {
        type: 'done',
        messageId: 'fixture-replay',
        content: 'Acknowledged saved response replayed.',
      },
      true,
    ),
  );
  await expect(composer).toHaveValue('A later draft must survive the error.');
  await expect(dialog.getByText('Acknowledged saved response replayed.')).toBeVisible();
  await page.screenshot({ path: `${directory}/chat-recovery-mobile-short.png` });
  expect((await appAxe(page).include('[role="dialog"]').analyze()).violations).toEqual([]);
  await page.setViewportSize({ width: 320, height: 568 });
  await page.addStyleTag({ content: 'html { font-size: 200%; }' });
  const footer = dialog.getByRole('button', { name: 'Send message' });
  await footer.scrollIntoViewIfNeeded();
  await expect(footer).toBeInViewport();
  expect(await dialog.evaluate((element) => element.scrollWidth <= element.clientWidth + 1)).toBe(
    true,
  );
  await page.screenshot({ path: `${directory}/chat-320-enlarged.png` });
  await page.keyboard.press('Escape');
  await expect(dialog).toHaveCount(0);
  await expect(opener).toBeFocused();
  writeFileSync(
    `${directory}/manifest.json`,
    JSON.stringify(
      {
        baseCommit: execFileSync('git', ['rev-parse', 'HEAD'], { encoding: 'utf8' }).trim(),
        sourceState:
          'Current working refinement code; controlled client stream fixture. Provider progressive callback and real HTTP stream covered separately by unit/integration tests.',
        capturedAt: new Date().toISOString(),
        viewports: ['1440x1000', '390x500', '320x568 with 200% root text'],
        liveProviderCalls: 0,
      },
      null,
      2,
    ),
  );
});
