import { expect, test } from '@playwright/test';
import { signInWorkflowFixture } from './helpers/onboarding';
import { appAxe } from './helpers/accessibility';

test('guided setup preserves saved inventory, resumes drafts and separates sharing', async ({
  page,
}) => {
  test.setTimeout(120000);
  await signInWorkflowFixture(page);
  await page.goto('/my-kitchen/setup');
  await page.evaluate(() => {
    for (const storage of [localStorage, sessionStorage])
      for (const key of Object.keys(storage)) if (key.includes('kitchen')) storage.removeItem(key);
  });
  await page.reload();
  await page.getByRole('button', { name: 'Start or resume equipment setup' }).click();
  await page.getByRole('button', { name: 'Something else / Custom equipment' }).click();
  const name = `Setup pan ${Date.now()}`;
  await page.getByLabel('Nickname', { exact: true }).fill(name);
  await expect(page.getByRole('button', { name: 'Continue setup', exact: true })).toBeDisabled();
  await page.getByRole('button', { name: 'Back', exact: true }).click();
  await page.getByRole('link', { name: 'Skip for now · keep saved records' }).click();
  await page.goto('/my-kitchen/setup');
  await page.getByRole('button', { name: 'Start or resume equipment setup' }).click();
  await expect(page.getByLabel('Nickname', { exact: true })).toHaveValue(name);
  await page.getByRole('button', { name: 'Discard draft', exact: true }).click();
  await page.getByRole('button', { name: 'Add equipment', exact: true }).click();
  await page
    .getByRole('combobox', { name: 'Equipment type', exact: true })
    .selectOption('saucepan');
  await page.getByLabel('Nickname', { exact: true }).fill(name);
  await page.getByRole('button', { name: 'Record another measurement', exact: true }).click();
  const measurement = page.getByRole('group', { name: 'Measurement 1', exact: true });
  await measurement.getByLabel('Value', { exact: true }).fill('3');
  await measurement.getByLabel('Unit', { exact: true }).selectOption('l');
  await page.getByRole('button', { name: 'Record another measurement', exact: true }).click();
  const width = page.getByRole('group', { name: 'Measurement 2', exact: true });
  await width.getByLabel('Measurement basis').selectOption('diameter');
  await width.getByLabel('Value', { exact: true }).fill('20');
  await width.getByLabel('Unit', { exact: true }).selectOption('cm');
  await page.getByRole('button', { name: 'Review and save equipment', exact: true }).click();
  await expect(page.getByRole('button', { name: `Edit ${name}`, exact: true })).toBeVisible();
  await page.getByRole('button', { name: 'Continue setup', exact: true }).click();
  const detail = page.getByRole('combobox', { name: 'Instruction detail', exact: true });
  await detail.selectOption((await detail.inputValue()) === 'detailed' ? 'brief' : 'detailed');
  await expect(page.getByRole('button', { name: 'Continue setup', exact: true })).toBeDisabled();
  await page.getByRole('button', { name: 'Save my cooking preferences', exact: true }).click();
  await expect(
    page.getByText('Your cooking preferences are saved.', { exact: true }),
  ).toBeVisible();
  await page.getByRole('button', { name: 'Continue setup', exact: true }).click();
  await expect(page.getByRole('heading', { name: 'Saved household facts' })).toBeVisible();
  const before = (await (await page.request.get('/api/v1/ai/settings')).json()).dataPolicy;
  await page.getByRole('button', { name: 'Review my equipment sharing choice' }).click();
  const sharing = page.getByRole('checkbox', {
    name: 'Allow permitted household equipment facts to be used by AI for my account',
  });
  await sharing.setChecked(!before.shareKitchenEquipment);
  await expect(page.getByRole('button', { name: 'Finish kitchen setup' })).toBeDisabled();
  // Leaving the review never publishes an unsaved consent choice.
  await page.reload();
  const after = (await (await page.request.get('/api/v1/ai/settings')).json()).dataPolicy;
  expect(after).toEqual(before);
  await page.getByRole('button', { name: 'Finish kitchen setup' }).click();
  await expect(page).toHaveURL(/\/my-kitchen$/);
  const kitchen = (await (await page.request.get('/api/v1/kitchen')).json()).kitchen;
  const saved = kitchen.items.filter((item: { name: string }) => item.name === name);
  expect(saved).toHaveLength(1);
  expect(saved[0].measurements).toEqual(
    expect.arrayContaining([
      expect.objectContaining({ value: 3, unit: 'l', basis: 'nominal-volume' }),
      expect.objectContaining({ value: 20, unit: 'cm', basis: 'diameter' }),
    ]),
  );
  await page.getByRole('button', { name: `Edit ${name}`, exact: true }).click();
  await page.setViewportSize({ width: 320, height: 560 });
  expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(true);
  expect((await appAxe(page).analyze()).violations).toEqual([]);
});
