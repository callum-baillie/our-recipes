import { expect, test } from '@playwright/test';

import { completeInitialOnboarding } from './helpers/onboarding';

test('an authenticated household can create and validate a local backup', async ({ page }) => {
  test.setTimeout(120_000);
  await completeInitialOnboarding(page, 'Backup test kitchen', 'Callum');
  await page.goto('/settings/backups');

  await page.getByRole('button', { name: 'Create backup' }).click();
  await expect(
    page.locator('.toast').filter({ hasText: 'Backup created and verified.' }),
  ).toBeVisible({
    timeout: 30_000,
  });

  const validateButton = page.getByRole('button', { name: 'Validate & restore' });
  await expect(validateButton).toBeVisible({ timeout: 30_000 });
  await validateButton.click();
  await expect(
    page.getByRole('heading', { name: 'Ready to restore, if you mean it.' }),
  ).toBeVisible({ timeout: 30_000 });
});
