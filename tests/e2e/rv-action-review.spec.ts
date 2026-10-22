import { expect, test } from '@playwright/test';
import { mkdirSync, writeFileSync } from 'node:fs';
import { execFileSync } from 'node:child_process';
import { signInWorkflowFixture } from './helpers/onboarding';
import { buildAppActionReview } from '../../src/lib/domain/ai-app-action-review';

const directory = 'screenshots/rv-completion/action-review';
test('named meal removal review has context and retains its stale error at desktop and narrow sizes', async ({
  page,
}) => {
  await signInWorkflowFixture(page);
  const threadId = '00000000-0000-4000-8000-000000000907';
  const id = '00000000-0000-4000-8000-000000000908';
  const parameters = { entryId: '00000000-0000-4000-8000-000000000909' };
  const review = buildAppActionReview({
    operationId: 'deleteMealPlanEntry',
    path: '/meal-plan/{entryId}',
    method: 'DELETE',
    parameters,
    body: null,
    snapshot: {
      meal: {
        title: 'Friday lentil supper',
        plannedFor: '2026-10-23',
        meal: 'dinner',
        mealLabel: 'Dinner',
        servings: 4,
        status: 'planned',
      },
    },
  });
  await page.route('**/api/v1/ai/chat/threads', (route) =>
    route.fulfill({ json: { threads: [{ id: threadId, title: 'Controlled action review' }] } }),
  );
  await page.route(`**/api/v1/ai/chat/threads/${threadId}`, (route) =>
    route.fulfill({ json: { messages: [], actions: [], jobs: [], turns: [] } }),
  );
  await page.route('**/api/v1/ai/app-actions?*', (route) =>
    route.fulfill({
      json: {
        proposals: [
          {
            id,
            version: 1,
            title: 'Remove a planned meal',
            status: 'pending',
            actions: [
              {
                summary: 'Remove one planned meal',
                method: 'DELETE',
                path: '/meal-plan/{entryId}',
                parameters,
                body: null,
                review,
              },
            ],
          },
        ],
      },
    }),
  );
  let confirmations = 0;
  await page.route('**/api/v1/ai/app-actions', (route) => {
    expect(route.request().postDataJSON()).toEqual({ id, version: 1, decision: 'apply' });
    confirmations++;
    return route.fulfill({
      status: 409,
      json: {
        error: {
          message:
            'The source data changed since this review. Ask chat to prepare a fresh proposal.',
        },
      },
    });
  });
  await page.goto('/');
  await page.getByRole('button', { name: 'Open AI assistant' }).click();
  const dialog = page.getByRole('dialog', { name: 'Kitchen assistant' });
  const card = dialog.getByRole('region', { name: 'Review proposed app changes' });
  await expect(card.getByRole('link', { name: 'Friday lentil supper' })).toBeVisible();
  await expect(card.getByText('Dinner', { exact: true })).toBeVisible();
  await expect(card.getByText('2026-10-23', { exact: true })).toBeVisible();
  await expect(card.getByText('4', { exact: true })).toBeVisible();
  await expect(card.getByText(/Not set|00000000/)).toHaveCount(0);
  mkdirSync(directory, { recursive: true });
  for (const [width, height, scale] of [
    [1440, 1000, 1],
    [390, 844, 1],
    [320, 568, 2],
  ]) {
    await page.setViewportSize({ width, height });
    await page.evaluate((scale) => {
      document.documentElement.style.fontSize = `${scale * 100}%`;
    }, scale);
    const confirm = card.getByRole('button', { name: 'Confirm changes' });
    await confirm.focus();
    await expect(confirm).toBeFocused();
    await expect(confirm).toBeInViewport();
    expect(await card.evaluate((element) => element.scrollWidth <= element.clientWidth + 1)).toBe(
      true,
    );
    expect(await dialog.evaluate((element) => element.scrollWidth <= element.clientWidth + 1)).toBe(
      true,
    );
    await page.screenshot({ path: `${directory}/meal-review-${width}-${scale}x.png` });
  }
  await card.getByRole('button', { name: 'Confirm changes' }).press('Enter');
  await expect(card.getByText(/The source data changed since this review/)).toBeVisible();
  expect(confirmations).toBe(1);
  await page.screenshot({ path: `${directory}/stale-review-320.png` });
  writeFileSync(
    `${directory}/evidence.json`,
    JSON.stringify(
      {
        revision: execFileSync('git', ['rev-parse', 'HEAD'], { encoding: 'utf8' }).trim(),
        fixture:
          'Controlled authorized metadata and 409 response; real handler/database stale enforcement covered by rv-action-review integration tests.',
        viewports: ['1440x1000', '390x844', '320x568 at 200% text'],
        date: new Date().toISOString(),
      },
      null,
      2,
    ),
  );
});
