import { expect, test, type Page, type BrowserContext } from '@playwright/test';
import { mkdirSync, writeFileSync } from 'node:fs';
import { execFileSync } from 'node:child_process';
import { signInWorkflowFixture } from './helpers/onboarding';
import { appAxe } from './helpers/accessibility';
const directory = 'screenshots/post-review/settings';
const states: string[] = [];
async function expectNoHorizontalOverflow(page: Page) {
  const layout = await page.evaluate(() => ({
    width: document.documentElement.scrollWidth,
    viewport: innerWidth,
    overflowing: [...document.querySelectorAll<HTMLElement>('body *')]
      .filter((element) => {
        const rect = element.getBoundingClientRect();
        return rect.width > 0 && rect.height > 0 && (rect.right > innerWidth || rect.left < 0);
      })
      .slice(0, 25)
      .map((element) => {
        const rect = element.getBoundingClientRect();
        const style = getComputedStyle(element);
        return {
          element: element.tagName,
          className: element.className,
          text: element.textContent?.trim().slice(0, 100),
          left: rect.left,
          right: rect.right,
          font: style.font,
          overflowWrap: style.overflowWrap,
          minWidth: style.minWidth,
        };
      }),
  }));
  expect(layout.width, JSON.stringify(layout, null, 2)).toBeLessThanOrEqual(layout.viewport);
}
async function capture(page: Page, name: string) {
  mkdirSync(directory, { recursive: true });
  await page.screenshot({ path: `${directory}/${name}.png` });
  states.push(name);
}
let cookies: Awaited<ReturnType<BrowserContext['cookies']>>;
test.beforeAll(async ({ browser }) => {
  const context = await browser.newContext();
  await signInWorkflowFixture(await context.newPage());
  cookies = await context.cookies();
  await context.close();
});
test.beforeEach(async ({ context }) => {
  await context.addCookies(cookies);
});
test.afterAll(() => {
  mkdirSync(directory, { recursive: true });
  writeFileSync(
    `${directory}/manifest.json`,
    JSON.stringify(
      {
        revision: execFileSync('git', ['rev-parse', 'HEAD'], { encoding: 'utf8' }).trim(),
        state:
          'Working post-review changes; controlled HTTP outcomes, no provider requests or settings writes.',
        capturedAt: new Date().toISOString(),
        states,
      },
      null,
      2,
    ),
  );
});

test('runtime overlap has keyboard choices, responsive review and a merged next request', async ({
  page,
}) => {
  test.setTimeout(120_000);
  await page.goto('/account/ai');
  const initial = await (await page.request.get('/api/v1/ai/settings')).json();
  const latest = structuredClone(initial);
  latest.account.version += 1;
  latest.account.preferences.instructions = 'Saved elsewhere: explain ingredients.';
  latest.account.preferences.processing = { executionMode: 'batch', batchMinItems: 7 };
  const writes: Record<string, unknown>[] = [];
  await page.route('**/api/v1/ai/settings', async (route) => {
    if (route.request().method() === 'PATCH') {
      const body = route.request().postDataJSON();
      writes.push(body);
      return route.fulfill(
        writes.length === 1
          ? { status: 409, json: { error: { message: 'Controlled concurrent edit' } } }
          : {
              json: {
                ...latest,
                account: {
                  ...latest.account,
                  preferences: body.preferences,
                  version: latest.account.version + 1,
                },
              },
            },
      );
    }
    return route.fulfill({ json: latest });
  });
  await page
    .getByLabel(/^Response style and planning preferences/)
    .fill('My draft: concise cooking steps.');
  await page.getByRole('button', { name: 'Save my AI defaults', exact: true }).click();
  await page.getByRole('button', { name: 'Load current settings', exact: true }).click();
  const review = page.getByRole('region', { name: 'Compare concurrent changes' });
  await expect(review).toBeVisible();
  const apply = review.getByRole('button', { name: 'Use reviewed draft' });
  await expect(apply).toBeDisabled();
  for (const width of [1440, 390, 320]) {
    await page.setViewportSize({ width, height: width === 1440 ? 1000 : 844 });
    await review.scrollIntoViewIfNeeded();
    await expectNoHorizontalOverflow(page);
    await capture(page, `runtime-overlap-${width}`);
  }
  await page.evaluate(() => {
    document.documentElement.style.fontSize = '200%';
  });
  await review.scrollIntoViewIfNeeded();
  await expectNoHorizontalOverflow(page);
  await capture(page, 'runtime-overlap-320-enlarged');
  for (const family of ['Arial, sans-serif', 'DejaVu Sans, sans-serif']) {
    await page.evaluate((value) => {
      document.body.style.fontFamily = value;
    }, family);
    await page
      .getByRole('button', { name: 'Update summaries', exact: true })
      .scrollIntoViewIfNeeded();
    if (family.startsWith('DejaVu')) await capture(page, 'summary-action-320-enlarged-fallback');
    await expectNoHorizontalOverflow(page);
  }
  await page.evaluate(() => {
    document.body.style.removeProperty('font-family');
  });
  const local = review.getByRole('radio', {
    name: 'Keep my edit: My draft: concise cooking steps.',
  });
  await local.focus();
  await page.keyboard.press('Space');
  await expect(local).toBeChecked();
  await expect(local).toBeFocused();
  await page.keyboard.press('ArrowDown');
  await expect(
    review.getByRole('radio', {
      name: 'Use current saved value: Saved elsewhere: explain ingredients.',
    }),
  ).toBeChecked();
  await page.keyboard.press('ArrowUp');
  await expect(local).toBeChecked();
  expect(
    (await appAxe(page).include('[aria-label="Compare concurrent changes"]').analyze()).violations,
  ).toEqual([]);
  await apply.click();
  await page.getByRole('button', { name: 'Save my AI defaults', exact: true }).click();
  await expect.poll(() => writes.length).toBe(2);
  expect(writes[1]).toMatchObject({
    version: latest.account.version,
    preferences: {
      instructions: 'My draft: concise cooking steps.',
      processing: { executionMode: 'batch', batchMinItems: 7 },
    },
  });
});

test('profile preserves separate questionnaire, Nutrition and schedule retain current fields in reviewed payloads', async ({
  page,
}) => {
  test.setTimeout(120_000);
  await page.setViewportSize({ width: 390, height: 844 });
  await page.goto('/account');
  const initial = await (await page.request.get('/api/v1/account/profile')).json();
  const current = {
    ...initial,
    revision: 'b'.repeat(64),
    profile: {
      ...initial.profile,
      locale: 'fr-FR',
      goalContext: {
        ...initial.profile.goalContext,
        kitchenInterview: {
          ...initial.profile.goalContext.kitchenInterview,
          taste: 'Saved questionnaire: savoury soups.',
        },
      },
    },
  };
  const writes: Record<string, unknown>[] = [];
  await page.route('**/api/v1/account/profile', async (route) => {
    if (route.request().method() === 'PATCH') {
      const body = route.request().postDataJSON();
      writes.push(body);
      return route.fulfill(
        writes.length === 1
          ? { status: 409, json: { error: { message: 'Controlled profile conflict' } } }
          : { json: { ...current, revision: 'c'.repeat(64) } },
      );
    }
    return route.fulfill({ json: current });
  });
  await page.getByLabel(/^Display name/).fill('Maya draft');
  await page.getByRole('button', { name: 'Save profile', exact: true }).click();
  await page.getByRole('button', { name: 'Load current profile' }).click();
  let review = page.getByRole('region', { name: 'Compare concurrent changes' });
  await review.scrollIntoViewIfNeeded();
  await capture(page, 'personal-profile-merge-mobile');
  await review.getByRole('button', { name: 'Use reviewed draft' }).click();
  await page.getByRole('button', { name: 'Save profile', exact: true }).click();
  await expect.poll(() => writes.length).toBe(2);
  expect(writes[1]).toMatchObject({
    expectedRevision: current.revision,
    settings: { displayName: 'Maya draft', locale: 'fr-FR' },
  });
  expect((writes[1].settings as { goalContext: unknown }).goalContext).not.toHaveProperty(
    'kitchenInterview',
  );
  await page.unroute('**/api/v1/account/profile');
  await page.goto('/account/nutrition');
  const nutritionSessionResponse = await page.request.get('/api/v1/nutrition/session');
  expect(nutritionSessionResponse.ok()).toBe(true);
  const { actor: nutritionActor } = await nutritionSessionResponse.json();
  expect(nutritionActor.viewedHouseholdProfileId).toBe(initial.profile.id);
  const nutritionId = nutritionActor.viewedNutritionProfileId;
  expect(typeof nutritionId).toBe('string');
  const nutritionResponse = await page.request.get(
    `/api/v1/nutrition/profiles/${nutritionId}?scope=settings`,
  );
  expect(nutritionResponse.ok()).toBe(true);
  const { profile: nutrition } = await nutritionResponse.json();
  expect(nutrition.id).toBe(nutritionId);
  const goal = page.getByLabel(/^Nutrition goal type/);
  await expect(goal).toHaveValue(nutrition.nutritionGoalType);
  const nutritionSave = page.getByRole('button', { name: /Save Maya's preferences/ });
  await expect(nutritionSave).toBeDisabled();
  const editedGoal = (await goal.inputValue()) === 'maintain' ? 'none' : 'maintain';
  const latestNutrition = {
    ...nutrition,
    version: nutrition.version + 1,
    estimatedTargetConsent: !nutrition.estimatedTargetConsent,
    dailyResetTimezone: 'Europe/London',
  };
  const nutritionWrites: Record<string, unknown>[] = [];
  await page.route(`**/api/v1/nutrition/profiles/${nutritionId}*`, async (route) => {
    if (route.request().method() === 'PATCH') {
      const body = route.request().postDataJSON();
      nutritionWrites.push(body);
      return route.fulfill(
        nutritionWrites.length === 1
          ? { status: 409, json: { error: { message: 'Controlled preferences conflict' } } }
          : {
              json: {
                profile: {
                  ...latestNutrition,
                  ...body.settings,
                  version: latestNutrition.version + 1,
                },
              },
            },
      );
    }
    return route.fulfill({ json: { profile: latestNutrition } });
  });
  await goal.selectOption(editedGoal);
  await expect(goal).toHaveValue(editedGoal);
  await expect(nutritionSave).toBeEnabled();
  await nutritionSave.click();
  await page.getByRole('button', { name: 'Load current preferences' }).click();
  review = page.getByRole('region', { name: 'Compare concurrent changes' });
  await review.scrollIntoViewIfNeeded();
  await capture(page, 'nutrition-merge-mobile');
  await review.getByRole('button', { name: 'Use reviewed draft' }).click();
  await page.getByRole('button', { name: /Save Maya's preferences/ }).click();
  await expect.poll(() => nutritionWrites.length).toBe(2);
  expect(nutritionWrites[0]).toMatchObject({
    expectedVersion: nutrition.version,
    settings: { nutritionGoalType: editedGoal },
  });
  expect(nutritionWrites[1]).toMatchObject({
    expectedVersion: latestNutrition.version,
    settings: {
      nutritionGoalType: editedGoal,
      estimatedTargetConsent: latestNutrition.estimatedTargetConsent,
      dailyResetTimezone: 'Europe/London',
    },
  });
  await page.goto('/account/automation');
  const schedule = await (await page.request.get('/api/v1/account/automation')).json();
  const latestSchedule = {
    ...schedule,
    version: schedule.version + 1,
    settings: { ...schedule.settings, timezone: 'Europe/London' },
  };
  const scheduleWrites: Record<string, unknown>[] = [];
  await page.route('**/api/v1/account/automation', async (route) => {
    if (route.request().method() === 'PATCH') {
      const body = route.request().postDataJSON();
      scheduleWrites.push(body);
      return route.fulfill(
        scheduleWrites.length === 1
          ? { status: 409, json: { error: { message: 'Controlled schedule conflict' } } }
          : {
              json: {
                ...latestSchedule,
                settings: { ...latestSchedule.settings, ...body.settings },
                version: latestSchedule.version + 1,
              },
            },
      );
    }
    return route.fulfill({ json: latestSchedule });
  });
  await page.getByRole('switch', { name: /Prepare a plan automatically/ }).setChecked(true);
  await page.getByLabel(/Days to plan/).fill(schedule.settings.days === 3 ? '4' : '3');
  await page.getByRole('button', { name: 'Save schedule', exact: true }).click();
  await page.getByRole('button', { name: 'Load current schedule' }).click();
  review = page.getByRole('region', { name: 'Compare concurrent changes' });
  await review.scrollIntoViewIfNeeded();
  await capture(page, 'schedule-merge-mobile');
  await review.getByRole('button', { name: 'Use reviewed draft' }).click();
  await page.getByRole('button', { name: 'Save schedule', exact: true }).click();
  await expect.poll(() => scheduleWrites.length).toBe(2);
  expect(scheduleWrites[1]).toMatchObject({
    expectedVersion: latestSchedule.version,
    settings: { timezone: 'Europe/London' },
  });
});
