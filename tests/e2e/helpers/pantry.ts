import { expect, type Page } from '@playwright/test';

/** Opens Add to pantry on its manual entry method. */
export async function openManualAdd(page: Page) {
  await page.goto('/pantry/add?mode=manual');
  await expect(page.getByRole('heading', { name: 'Add to pantry', level: 1 })).toBeVisible();
  await expect(page.getByLabel('Name', { exact: true })).toBeVisible();
}

export async function openMoreDetails(page: Page) {
  const details = page.locator('details', { hasText: 'More details' }).first();
  if ((await details.getAttribute('open')) === null)
    await details.locator(':scope > summary').click();
  return details;
}

/** Picks a storage place whether the form shows it as a button row or, for long lists, a menu. */
export async function chooseLocation(page: Page, label: string) {
  const choice = page.getByRole('radio', { name: label, exact: true });
  if (await choice.count()) await choice.click();
  else await page.getByRole('combobox', { name: 'Location', exact: true }).selectOption({ label });
}

/** Saves what is on the manual form and waits for the confirmation. */
export async function submitManualAdd(page: Page) {
  await page.getByRole('button', { name: 'Add to pantry', exact: true }).click();
}

export async function expectAdded(page: Page, text = 'added to your pantry') {
  await expect(page.getByRole('status').filter({ hasText: text }).last()).toBeVisible({
    timeout: 15000,
  });
}

/** Adds one item by hand, then returns to the Pantry list. */
export async function addPantryItem(
  page: Page,
  input: {
    name: string;
    quantity: string;
    unit?: string;
    expiry?: string;
    location?: string;
  },
) {
  await openManualAdd(page);
  await page.getByLabel('Name', { exact: true }).fill(input.name);
  await page.getByLabel(`${input.name} amount`).fill(input.quantity);
  await page.getByRole('combobox', { name: 'Unit', exact: true }).selectOption(input.unit ?? 'g');
  if (input.location) await chooseLocation(page, input.location);
  if (input.expiry) await page.getByLabel('Best before', { exact: true }).fill(input.expiry);
  await submitManualAdd(page);
  await expectAdded(page);
  await page.goto('/pantry');
  await expect(page.getByRole('heading', { name: 'Pantry', exact: true })).toBeVisible();
}
