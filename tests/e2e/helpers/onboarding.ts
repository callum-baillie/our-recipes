import type { Page } from '@playwright/test';

export const TEST_PASSPHRASE = 'correct horse battery table';
export const TEST_PROFILE_PIN = '482951';

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
  await page.getByLabel('Email').fill(email);
  await page.getByLabel('Passphrase').fill(TEST_PASSPHRASE);
  await page.getByLabel('Profile PIN').fill(TEST_PROFILE_PIN);
  await page.getByRole('button', { name: 'Continue' }).click();
  await page.getByRole('button', { name: 'Continue' }).click();
  await page.getByRole('button', { name: 'Continue' }).click();
  await page.getByRole('button', { name: 'Continue' }).click();
  await page.getByRole('button', { name: 'Add Stovies & open recipe' }).click();
  await page.getByLabel('I saved these one-time codes somewhere private.').check();
  await page.getByRole('button', { name: 'Continue to sign in' }).click();
  await page.getByLabel('Email').fill(email);
  await page.getByLabel('Passphrase').fill(TEST_PASSPHRASE);
  await page.getByRole('button', { name: 'Sign in', exact: true }).click();
  await page.waitForURL(/\/recipes\//u);
}
