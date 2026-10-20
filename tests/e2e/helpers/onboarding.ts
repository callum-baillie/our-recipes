import type { BrowserContext, Page } from '@playwright/test';

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

export async function completeInitialOnboarding(
  page: Page,
  kitchenName: string,
  displayName: string,
): Promise<void> {
  const email = onboardingEmail(kitchenName, displayName);
  await page.goto('/');
  await page.getByLabel('Kitchen name').fill(kitchenName);
  await page.getByRole('button', { name: 'Continue' }).click();
  await page.getByRole('button', { name: 'Continue' }).click();
  await page.getByLabel('Display name').fill(displayName);
  await page.getByRole('textbox', { name: /^Email\b/ }).fill(email);
  await page.getByLabel(/^\s*Passphrase/).fill(TEST_PASSPHRASE);
  await page.getByRole('button', { name: 'Continue' }).click();
  await page.getByRole('button', { name: 'Set up nutrition later' }).click();
  await page.getByRole('button', { name: 'Continue' }).click();
  await page.getByRole('button', { name: 'Continue' }).click();
  await page.getByRole('button', { name: 'Add Stovies & open recipe' }).click();
  await page.getByLabel('I saved these one-time codes somewhere private.').check();
  await page.getByRole('button', { name: 'Continue to sign in' }).click();
  await page.getByRole('textbox', { name: /^Email\b/ }).fill(email);
  await page.getByLabel(/^\s*Passphrase/).fill(TEST_PASSPHRASE);
  await page.getByRole('button', { name: 'Sign in', exact: true }).click();
  await page.waitForURL((url) => url.pathname.startsWith('/recipes/'));
}
