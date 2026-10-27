import { expect, test, type Page, type BrowserContext } from '@playwright/test';
import { mkdirSync, writeFileSync } from 'node:fs';
import { execFileSync } from 'node:child_process';
import {
  TEST_PASSPHRASE,
  chatPick,
  chatSay,
  chatSkipOptional,
  signInWorkflowFixture,
} from './helpers/onboarding';
import { appAxe } from './helpers/accessibility';
const directory = 'screenshots/full-refinement/settings';

async function capture(page: Page, state: string, fullPage = false) {
  mkdirSync(directory, { recursive: true });
  await page.screenshot({ path: `${directory}/${state}.png`, fullPage });
}
let signedInCookies: Awaited<ReturnType<BrowserContext['cookies']>>;
test.beforeAll(async ({ browser }) => {
  const context = await browser.newContext();
  await signInWorkflowFixture(await context.newPage());
  signedInCookies = await context.cookies();
  await context.close();
});
test.beforeEach(async ({ context }) => {
  await context.addCookies(signedInCookies);
});
test.afterAll(() => {
  mkdirSync(directory, { recursive: true });
  writeFileSync(
    `${directory}/manifest.json`,
    JSON.stringify(
      {
        commit: execFileSync('git', ['rev-parse', 'HEAD'], { encoding: 'utf8' }).trim(),
        changes:
          'Working refinement branch; current idle and interaction states, not historical before-implementation captures.',
        capturedAt: new Date().toISOString(),
        viewportStates: ['1440x1000', '390x844', '320x844', '390x560', '850x1000'],
        fixture: 'Synthetic workflow fixture; no provider calls or measurement writes.',
      },
      null,
      2,
    ),
  );
});

test('Nutrition switches and advanced errors are reachable and keep entered work', async ({
  page,
}) => {
  test.setTimeout(120_000);
  await page.setViewportSize({ width: 390, height: 844 });
  await page.goto('/account/nutrition');
  await page.getByText(/Optional estimates ·/).click();
  const enabled = page.getByRole('switch', { name: /^Allow optional estimates/ });
  const save = page.getByRole('button', { name: /Save Maya's preferences/ });
  await expect(save).toBeDisabled();
  await enabled.scrollIntoViewIfNeeded();
  await capture(page, 'nutrition-estimates-idle-mobile');
  await enabled.setChecked(!(await enabled.isChecked()));
  await expect(save).toBeEnabled();
  await expect(page.getByRole('button', { name: /Preview estimated maintenance/ })).toBeDisabled();
  await save.scrollIntoViewIfNeeded();
  await capture(page, 'nutrition-estimates-dirty-mobile');
  // No preference or measurement write is needed to inspect this correction.
  await page.goto('/nutrition?log=weight');
  const dialog = page.getByRole('dialog');
  await expect(dialog).toBeVisible();
  await dialog.getByLabel(/^Weight \(/).fill('70');
  await dialog.getByLabel('Time', { exact: true }).fill('12:00');
  await dialog.getByText('Additional measurements (optional)').click();
  const mass = dialog.getByLabel(/^Fat-free body weight/);
  await mass.fill('80');
  await dialog.locator('form').evaluate((form: HTMLFormElement) => form.requestSubmit());
  await expect(mass).toHaveAttribute('aria-invalid', 'true');
  await expect(mass).toBeFocused();
  const errorId = await mass.getAttribute('aria-describedby');
  await expect(page.locator(`[id="${errorId}"]`)).toContainText(/weight/);
  await page.setViewportSize({ width: 390, height: 560 });
  await expect(mass).toBeInViewport();
  await expect
    .poll(async () => {
      const field = await mass.boundingBox();
      const footer = await dialog.locator('footer').boundingBox();
      return Boolean(field && footer && field.y + field.height <= footer.y);
    })
    .toBe(true);
  await capture(page, 'weight-advanced-error-short-mobile');
  await page.setViewportSize({ width: 1440, height: 1000 });
  await capture(page, 'weight-advanced-error-desktop');
  expect((await appAxe(page).include('dialog').analyze()).violations).toEqual([]);
});

test('interview and onboarding retain drafts with named errors and keyboard choices', async ({
  page,
}) => {
  test.setTimeout(120_000);
  await page.setViewportSize({ width: 1440, height: 1000 });
  await page.goto('/account');
  const start = page.getByRole('button', {
    name: /Start guided questionnaire|Edit guided questionnaire/,
  });
  await start.click();
  const editTaste = page.getByRole('button', { name: 'Edit taste', exact: true });
  if (await editTaste.isVisible()) await editTaste.click();
  await page.getByLabel(/Do you lean sweet/).fill('Unsaved fixture answer');
  await page.getByRole('button', { name: 'Close', exact: true }).click();
  await expect(page.getByRole('button', { name: 'Resume unsaved questionnaire' })).toBeVisible();
  await expect(page.getByText(/Unsaved questionnaire answers are retained/)).toBeVisible();
  await capture(page, 'interview-unsaved-desktop');
  await page.getByRole('button', { name: 'Resume unsaved questionnaire' }).click();
  await expect(page.getByLabel(/Do you lean sweet/)).toHaveValue('Unsaved fixture answer');
  await page.goto('/settings/profiles');
  await page.setViewportSize({ width: 390, height: 844 });
  await page.getByRole('button', { name: 'Add profile', exact: true }).click();
  const dialog = page.getByRole('dialog', { name: 'New profile onboarding' });
  const name = dialog.getByLabel('Display name', { exact: true });
  await name.fill('   ');
  await name.press('Enter');
  await expect(name).toHaveAttribute('aria-invalid', 'true');
  await expect(name).toBeFocused();
  await capture(page, 'onboarding-invalid-name-mobile');
  await name.fill('Controlled onboarding');
  await name.press('Enter');
  // An answered question is entered work: closing asks before discarding it.
  const dismissed = page.waitForEvent('dialog');
  const close = dialog.getByRole('button', { name: 'Close profile onboarding' }).click();
  const confirmation = await dismissed;
  expect(confirmation.message()).toContain('Discard this new profile draft');
  await confirmation.dismiss();
  await close;
  await expect(dialog).toBeVisible();
  await capture(page, 'onboarding-type-popup-mobile');
  expect((await appAxe(page).include('dialog').analyze()).violations).toEqual([]);
  await page.route('**/api/v1/profiles/onboarding', async (route) =>
    route.fulfill({
      status: 201,
      json: {
        profile: {
          id: 'dummy-created-profile',
          displayName: 'Controlled onboarding',
          color: '#637A45',
        },
        recoveryCodes: ['DUMMY-NOT-A-VALID-RECOVERY-CODE'],
        requiresEmailVerification: false,
      },
    }),
  );
  await chatSay(dialog, 'Email', 'controlled-onboarding@example.test');
  await chatSay(dialog, 'Passphrase', TEST_PASSPHRASE);
  await chatPick(dialog, /^Parent/u);
  await chatPick(dialog, /^Adult/u);
  await chatSkipOptional(dialog);
  await chatPick(dialog, 'Create profile');
  await expect(dialog.getByRole('heading', { name: 'Save your recovery codes' })).toBeVisible();
  const finish = dialog.getByRole('button', { name: 'Finish profile setup' });
  await expect(finish).toBeDisabled();
  await expect(dialog.getByRole('button', { name: 'Close profile onboarding' })).toBeDisabled();
  await page.keyboard.press('Escape');
  await expect(dialog).toBeVisible();
  await capture(page, 'onboarding-controlled-completion-mobile');
  await dialog.getByLabel('I saved these one-time codes somewhere private.').check();
  await finish.click();
  await expect(dialog).not.toBeVisible();
  // Let the parent reconcile its authoritative member list before ending the fixture.
  await page.waitForLoadState('networkidle');
});

test('AI conflict review and mobile store selector preserve independent drafts', async ({
  page,
}) => {
  test.setTimeout(120_000);
  await page.setViewportSize({ width: 390, height: 844 });
  await page.goto('/account/ai');
  const current = await (await page.request.get('/api/v1/ai/settings')).json();
  await page.route('**/api/v1/ai/settings', async (route) => {
    if (route.request().method() === 'PATCH')
      await route.fulfill({
        status: 409,
        json: { error: { message: 'Fixture version conflict' } },
      });
    else
      await route.fulfill({
        json: { ...current, account: { ...current.account, version: current.account.version + 1 } },
      });
  });
  const instructions = page.getByLabel(/^Response style and planning preferences/);
  await instructions.fill('Prefer brief steps in this draft.');
  await page.getByRole('button', { name: 'Save my AI defaults', exact: true }).click();
  await page.getByRole('button', { name: 'Load current settings', exact: true }).click();
  await expect(page.getByRole('button', { name: 'Use reviewed draft' })).toBeVisible();
  await capture(page, 'ai-default-conflict-mobile');
  await page.getByRole('button', { name: 'Use reviewed draft' }).click();
  await expect(instructions).toHaveValue('Prefer brief steps in this draft.');
  await expect(
    page.getByRole('button', { name: 'Save my AI defaults', exact: true }),
  ).toBeEnabled();
  await page.unroute('**/api/v1/ai/settings');
  await page.goto('/settings/lists');
  const selected = page.getByRole('combobox', { name: 'Currently editing', exact: true });
  await expect(selected).toBeVisible();
  await selected.scrollIntoViewIfNeeded();
  await capture(page, 'store-selector-mobile');
  for (const width of [320, 850, 1440]) {
    await page.setViewportSize({ width, height: width === 320 ? 844 : 1000 });
    await expect(page.locator('body')).toBeVisible();
    expect(
      await page.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth),
    ).toBe(true);
    await capture(page, `stores-${width}`, true);
  }
  await page.setViewportSize({ width: 390, height: 844 });
  await page.evaluate(() => {
    document.documentElement.style.fontSize = '200%';
  });
  await selected.scrollIntoViewIfNeeded();
  expect(await page.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth)).toBe(
    true,
  );
  await capture(page, 'store-selector-enlarged-mobile');
});

test('copied destination uses the verified global switch and keeps account authorization', async ({
  page,
}) => {
  test.setTimeout(120_000);
  const roster = await (await page.request.get('/api/v1/profiles?enriched=true')).json();
  const owner = roster.profiles.find(
    (profile: { displayName: string }) => profile.displayName === 'Maya',
  );
  expect(owner, 'Known synthetic household owner').toBeTruthy();
  const beforeSession = await (await page.request.get('/api/v1/nutrition/session')).json();
  expect(beforeSession.actor.householdProfileId).toBe(owner.id);
  let recipient = roster.profiles.find(
    (profile: { displayName: string }) => profile.displayName === 'Copy fixture child',
  );
  if (!recipient) {
    const created = await page.request.post('/api/v1/profiles/onboarding', {
      headers: { Origin: 'http://127.0.0.1:3100' },
      data: {
        role: 'child',
        profile: {
          displayName: 'Copy fixture child',
          color: '#637A45',
          avatarUrl: '',
          units: 'metric',
          temperatureUnit: 'C',
          locale: 'en-GB',
          timezone: 'UTC',
        },
        credentials: { email: 'copy-fixture-child@example.test', passphrase: TEST_PASSPHRASE },
        nutrition: { profileType: 'dependent' },
      },
    });
    expect(created.ok()).toBe(true);
    recipient = (await created.json()).profile;
  }
  const grant = await page.request.post('/api/v1/admin/guardians', {
    headers: { Origin: 'http://127.0.0.1:3100' },
    data: { parentProfileId: owner.id, childProfileId: recipient.id, enabled: true },
  });
  expect(grant.ok()).toBe(true);
  await page.setViewportSize({ width: 390, height: 844 });
  await page.goto('/nutrition');
  await page.getByRole('button', { name: 'Log food', exact: true }).first().click();
  await page.getByRole('button', { name: /Copy a diary day Append/ }).click();
  const copy = page.getByRole('dialog', { name: 'Copy a diary day' });
  await copy.getByLabel('Destination person').selectOption({ label: 'Copy fixture child' });
  await copy.getByLabel('Source date').fill('2026-10-01');
  await copy.getByLabel('Destination date').fill('2026-10-02');
  let commands = 0;
  await page.route('**/diary-commands', async (route) => {
    commands++;
    await route.fulfill({
      json: { result: { revisionIds: ['controlled-copy-result'] }, replayed: false },
    });
  });
  await copy.getByRole('button', { name: 'Copy confirmed entries' }).click();
  await expect(copy.getByText(/1 entry copied to Copy fixture child/)).toBeVisible();
  await capture(page, 'copy-result-authorized-destination-mobile');
  await copy.getByRole('button', { name: /Open Copy fixture child’s diary/ }).click();
  const verification = page.getByRole('dialog', { name: 'Switch to Copy fixture child' });
  await expect(verification).toBeVisible();
  await expect(copy).not.toBeVisible();
  await verification.getByLabel('Password', { exact: true }).fill(TEST_PASSPHRASE);
  await verification.getByRole('button', { name: 'Switch profile', exact: true }).click();
  await expect(page).toHaveURL(/view=diary&date=2026-10-02/, { timeout: 30_000 });
  await expect(page.getByRole('heading', { name: 'Copy fixture child’s nutrition' })).toBeVisible();
  const session = await (await page.request.get('/api/v1/nutrition/session')).json();
  expect(
    session.actor,
    JSON.stringify({ before: beforeSession.actor, after: session.actor }),
  ).toMatchObject({ householdProfileId: owner.id, viewedHouseholdProfileId: recipient.id });
  expect(session.actor.viewedHouseholdProfileId).toBe(recipient.id);
  expect(commands).toBe(1);
  await capture(page, 'copy-destination-diary-mobile', true);
});
