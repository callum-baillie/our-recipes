import type { BrowserContext, Locator, Page } from '@playwright/test';

export const TEST_PASSPHRASE = 'correct horse battery table';

let workflowCookies: Awaited<ReturnType<BrowserContext['cookies']>> | null = null;
/** Synthetic regression fixtures share one session; the release journey tests sign-in itself. */
export async function signInWorkflowFixture(page: Page): Promise<void> {
  const email = 'workflow-refinement-fixture-maya@example.test';
  if (workflowCookies) await page.context().addCookies(workflowCookies);
  const current = await page.request.get('/api/auth/get-session');
  const account = await current.json().catch(() => null);
  if (current.ok() && account?.user?.email === email) return;
  const request = () =>
    page.request.post('/api/auth/sign-in/email', {
      headers: { Origin: 'http://127.0.0.1:3100' },
      data: { email, password: TEST_PASSPHRASE },
    });
  let response = await request();
  if (response.status() === 429) {
    const seconds = Number(response.headers()['retry-after']);
    if (Number.isFinite(seconds) && seconds > 0 && seconds <= 60) {
      // Only a refused authentication request is retried, after its actual server deadline.
      await new Promise((resolve) => setTimeout(resolve, Math.ceil(seconds * 1000)));
      response = await request();
    }
  }
  if (!response.ok())
    throw new Error(`Synthetic fixture sign-in returned HTTP ${response.status()}.`);
  workflowCookies = await page.context().cookies();
}

export function onboardingEmail(kitchenName: string, displayName: string): string {
  const slug = `${kitchenName}-${displayName}`
    .toLocaleLowerCase()
    .replace(/[^a-z0-9]+/gu, '-')
    .replace(/^-|-$/gu, '')
    .slice(0, 50);
  return `${slug}@example.test`;
}

type ChatScope = Page | Locator;

/** Types an answer into the onboarding chat and sends it with Enter. */
export async function chatSay(scope: ChatScope, label: string | RegExp, value: string) {
  const field = scope.getByLabel(label, { exact: typeof label === 'string' });
  await field.fill(value);
  await field.press('Enter');
}

/** Taps a quick reply or option card. Names match by substring, like a person reading the label. */
export async function chatPick(scope: ChatScope, name: string | RegExp) {
  await scope.getByRole('button', { name }).first().click();
}

/** Name, email and passphrase: the three questions every profile starts with. */
export async function chatIdentity(
  scope: ChatScope,
  profile: { displayName: string; email: string; passphrase?: string },
) {
  await chatSay(scope, 'Display name', profile.displayName);
  await chatSay(scope, 'Email', profile.email);
  await chatSay(scope, 'Passphrase', profile.passphrase ?? TEST_PASSPHRASE);
}

/** Measurement choices and "later" for nutrition and goals, as a quick household would answer. */
export async function chatSkipOptional(scope: ChatScope, options: { units?: boolean } = {}) {
  if (options.units !== false) {
    await chatPick(scope, 'US customary');
    await chatPick(scope, 'Fahrenheit');
  }
  await chatPick(scope, 'Set up nutrition later');
  await chatPick(scope, 'Skip for now');
}

/** Drives the first-run chat from the greeting to the recovery codes, then signs in. */
export async function completeInitialOnboarding(
  page: Page,
  kitchenName: string,
  displayName: string,
): Promise<void> {
  const email = onboardingEmail(kitchenName, displayName);
  await page.goto('/');
  await chatSay(page, 'Kitchen name', kitchenName);
  await chatPick(page, 'Use this icon');
  await chatPick(page, 'Looks good');
  await chatIdentity(page, { displayName, email });
  await chatSkipOptional(page);
  await chatPick(page, /Use Example recipe/u);
  await chatPick(page, 'That’s everyone for now');
  await chatPick(page, 'Add Stovies & open recipe');
  await page.getByLabel('I saved these one-time codes somewhere private.').check();
  await page.getByRole('button', { name: 'Continue to sign in' }).click();
  await page.getByRole('textbox', { name: /^Email\b/ }).fill(email);
  await page.getByLabel(/^\s*Passphrase/).fill(TEST_PASSPHRASE);
  await page.getByRole('button', { name: 'Sign in', exact: true }).click();
  await page.waitForURL((url) => url.pathname.startsWith('/recipes/'));
}

/** Adds a profile through the dialog chat (an admin adding someone to an existing kitchen). */
export async function completeProfileOnboarding(
  dialog: Locator,
  profile: { displayName: string; email: string; role?: RegExp },
): Promise<void> {
  await chatIdentity(dialog, profile);
  await chatPick(dialog, profile.role ?? /^Parent/u);
  if (!profile.role || !/Child/u.test(profile.role.source)) await chatPick(dialog, /^Adult/u);
  await chatSkipOptional(dialog);
  await chatPick(dialog, 'Create profile');
  await dialog.getByLabel('I saved these one-time codes somewhere private.').check();
  await dialog.getByRole('button', { name: 'Finish profile setup' }).click();
}
