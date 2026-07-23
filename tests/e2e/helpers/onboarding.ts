import type { Page } from '@playwright/test';

export async function completeInitialOnboarding(
  page: Page,
  kitchenName: string,
  displayName: string,
): Promise<void> {
  await page.goto('/');
  await page.getByLabel('Kitchen name').fill(kitchenName);
  await page.getByRole('button', { name: 'Continue' }).click();
  await page.getByRole('button', { name: 'Continue' }).click();
  await page.getByLabel('Display name').fill(displayName);
  await page.getByRole('button', { name: 'Continue' }).click();
  await page.getByRole('button', { name: 'Continue' }).click();
  await page.getByRole('button', { name: 'Continue' }).click();
  await page.getByRole('button', { name: 'Open the cookbook' }).click();
}
