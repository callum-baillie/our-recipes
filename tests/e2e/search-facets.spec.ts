import { expect, test } from '@playwright/test';
import { completeInitialOnboarding } from './helpers/onboarding';
import { appAxe } from './helpers/accessibility';

test('search and tags stay compact, scroll in one row, and filter real results', async ({
  page,
}) => {
  test.setTimeout(120_000);
  const errors: string[] = [];
  page.on('pageerror', (error) => errors.push(error.message));
  page.on('console', (message) => {
    if (message.type() === 'error') errors.push(message.text());
  });
  await completeInitialOnboarding(page, 'Search refinements', 'Alex');
  const recipeId = new URL(page.url()).pathname.split('/')[2]!;
  const recipe = (await (await page.request.get(`/api/v1/recipes/${recipeId}`)).json()).recipe;
  const tags = [
    'Batch cooking',
    'Budget meals',
    'Comfort food',
    'Family favorites',
    'Freezer friendly',
    'High protein',
    'Lunch ideas',
    'One pot',
    'Quick dinners',
    'Scottish',
    'Seasonal',
    'Slow cooking',
    'Vegetables',
    'Weekend cooking',
    'Winter warmers',
  ];
  const tagged = await page.request.patch(`/api/v1/recipes/${recipeId}/tags`, {
    headers: { Origin: 'http://127.0.0.1:3100' },
    data: { tags, expectedRevision: recipe.currentRevision },
  });
  expect(tagged.ok()).toBeTruthy();
  await page.goto('/recipes');
  await expect(page).toHaveTitle(/Recipebook/);
  const surface = page.getByRole('region', { name: 'Search recipes and filters', exact: true });
  const shelf = surface.getByRole('group', { name: 'Search recipes quick filters', exact: true });
  for (const width of [320, 390, 768, 1440]) {
    await page.setViewportSize({ width, height: 900 });
    await expect(
      surface.getByRole('searchbox', { name: 'Search recipes', exact: true }),
    ).toBeVisible();
    const rows = await shelf
      .getByRole('button')
      .evaluateAll((buttons) =>
        buttons.map((button) => Math.round(button.getBoundingClientRect().top)),
      );
    expect(new Set(rows).size).toBe(1);
    expect((await surface.boundingBox())!.height).toBeLessThanOrEqual(116);
    expect(
      await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth),
    ).toBeTruthy();
    if (width > 650) {
      const forward = surface.getByRole('button', { name: 'Scroll filters forward' });
      await expect(forward).toBeVisible();
      await forward.click();
      await expect.poll(() => shelf.evaluate((element) => element.scrollLeft)).toBeGreaterThan(50);
      await surface.getByRole('button', { name: 'Scroll filters backward' }).click();
      await expect.poll(() => shelf.evaluate((element) => element.scrollLeft)).toBeLessThan(5);
    } else {
      await expect(surface.getByRole('button', { name: 'Scroll filters forward' })).toHaveCount(0);
    }
    await surface.screenshot({ caret: 'initial', path: `/tmp/bord-search-${width}.png` });
  }
  await page.setViewportSize({ width: 390, height: 844 });
  const finalTag = shelf.getByRole('button', { name: 'winter warmers · Tag 1', exact: true });
  await finalTag.focus();
  await page.keyboard.press('Enter');
  await expect(page).toHaveURL(/tag=winter\+warmers/);
  await expect(finalTag).toHaveAttribute('aria-pressed', 'true');
  await expect(
    page.getByRole('link', { name: 'Open Traditional Scottish Stovies', exact: true }).first(),
  ).toBeVisible();
  await shelf.getByRole('button', { name: 'All recipes', exact: true }).click();
  await expect(page).not.toHaveURL(/tag=/);
  await surface
    .getByRole('searchbox', { name: 'Search recipes', exact: true })
    .fill('nothing matches this search');
  await expect(page).toHaveURL(/q=nothing/);
  await expect(page.getByRole('heading', { name: 'Nothing matched those filters.' })).toBeVisible();
  await surface.getByRole('searchbox', { name: 'Search recipes', exact: true }).fill('');
  await expect(page).not.toHaveURL(/q=./);
  await surface.getByRole('button', { name: 'Advanced search' }).click();
  await expect(page.getByRole('dialog', { name: 'Advanced search', exact: true })).toBeVisible();
  await page.getByRole('button', { name: 'Close advanced search' }).click();
  await page.evaluate(() => {
    document.documentElement.dataset.theme = 'dark';
    document.documentElement.style.colorScheme = 'dark';
  });
  expect(
    (await appAxe(page).include('section[aria-label="Search recipes and filters"]').analyze())
      .violations,
  ).toEqual([]);
  await surface.screenshot({ caret: 'initial', path: '/tmp/bord-search-mobile-dark.png' });
  await page.goto('/pantry');
  await expect(
    page.getByRole('region', { name: 'Search Pantry and filters', exact: true }),
  ).toBeVisible();
  const pantryShelf = page.getByRole('group', { name: 'Search Pantry quick filters', exact: true });
  await pantryShelf.getByRole('button', { name: 'Fridge', exact: true }).click();
  await expect(pantryShelf.getByRole('button', { name: 'Fridge', exact: true })).toHaveAttribute(
    'aria-pressed',
    'true',
  );
  expect(errors).toEqual([]);
});
