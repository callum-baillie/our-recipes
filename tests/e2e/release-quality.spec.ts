import AxeBuilder from '@axe-core/playwright';
import { expect, test } from '@playwright/test';
import sharp from 'sharp';

import { completeInitialOnboarding } from './helpers/onboarding';

const surfaces = [
  { name: 'desktop', viewport: { width: 1440, height: 900 } },
  { name: 'tablet', viewport: { width: 768, height: 1024 } },
  { name: 'mobile', viewport: { width: 390, height: 844 } },
] as const;

async function homeThemeContrast(page: import('@playwright/test').Page): Promise<{
  heading: number;
  planner: number;
}> {
  return page.evaluate(() => {
    const toRgb = (value: string): [number, number, number] => {
      const rgb = value
        .match(/\d+(?:\.\d+)?/g)
        ?.slice(0, 3)
        .map(Number);
      if (rgb?.length === 3) return rgb as [number, number, number];

      const hex = value.trim().replace('#', '');
      return [
        Number.parseInt(hex.slice(0, 2), 16),
        Number.parseInt(hex.slice(2, 4), 16),
        Number.parseInt(hex.slice(4, 6), 16),
      ];
    };
    const luminance = (value: [number, number, number]) =>
      value
        .map((channel) => {
          const normalized = channel / 255;
          return normalized <= 0.03928 ? normalized / 12.92 : ((normalized + 0.055) / 1.055) ** 2.4;
        })
        .reduce((total, channel, index) => total + channel * [0.2126, 0.7152, 0.0722][index], 0);
    const contrast = (foreground: string, background: string) => {
      const [first, second] = [luminance(toRgb(foreground)), luminance(toRgb(background))].sort(
        (a, b) => b - a,
      );
      return (first + 0.05) / (second + 0.05);
    };

    const root = getComputedStyle(document.documentElement);
    const heading = document.querySelector('.home-hero h1');
    const planner = document.querySelector('.home-plan-card');
    if (!heading || !planner) throw new Error('Home contrast targets are missing.');

    return {
      heading: contrast(getComputedStyle(heading).color, root.getPropertyValue('--page')),
      planner: contrast(getComputedStyle(planner).color, getComputedStyle(planner).backgroundColor),
    };
  });
}

async function createRecipeForReview(page: import('@playwright/test').Page): Promise<void> {
  await completeInitialOnboarding(page, 'The Release Table', 'Maya');
  await page.goto('/recipes/new');
  await page.getByLabel('Recipe name').fill('Print-ready tomato soup');
  await page.getByLabel('Serves').fill('4 servings');
  const categoryInput = page.getByRole('combobox', { name: 'Categories (optional)' });
  await categoryInput.fill('dinner');
  await categoryInput.press('Enter');
  await categoryInput.fill('Main dish');
  await categoryInput.press('Enter');
  const cuisineInput = page.getByRole('combobox', { name: 'Cuisines (optional)' });
  await cuisineInput.fill('Italian');
  await cuisineInput.press('Enter');
  await cuisineInput.fill('Family table');
  await cuisineInput.press('Enter');
  await page.getByLabel('Ingredient 1-1 quantity').fill('0.25');
  await page.getByLabel('Ingredient 1-1 unit').fill('cup');
  await page.getByLabel('Ingredient 1-1 item').fill('tomatoes');
  await page.getByLabel('Method section 1, step 1').fill('Simmer gently.');
  await page.getByLabel('Calories (kcal)').fill('230');
  await page.getByLabel('Protein (g)').fill('5');
  await page.getByLabel('Carbohydrates (g)').fill('22');
  await page.getByLabel('Fat (g)', { exact: true }).fill('14');
  await page.getByLabel('Saturated fat (g)').fill('3');
  await page.getByLabel('Fiber (g)').fill('6');
  await page.getByLabel('Sugar (g)').fill('9');
  await page.getByLabel('Sodium (mg)').fill('410');
  await page.getByRole('button', { name: 'Add to the cookbook' }).click();
  await expect(page.getByRole('heading', { name: 'Print-ready tomato soup' })).toBeVisible();
}

test('release-quality matrix keeps the real cookbook flow readable across surfaces and print', async ({
  page,
}, testInfo) => {
  const consoleErrors: string[] = [];
  page.on('console', (message) => {
    if (message.type() === 'error') consoleErrors.push(message.text());
  });

  await createRecipeForReview(page);
  const recipeUrl = page.url();

  await page.goto('/');
  const viewportContent = await page.locator('meta[name="viewport"]').getAttribute('content');
  expect(viewportContent).toContain('width=device-width');
  expect(viewportContent).toContain('viewport-fit=cover');
  expect(viewportContent).not.toMatch(/user-scalable=no|maximum-scale=1/u);
  const addRecipeTrigger = page.getByRole('link', { name: 'Add a recipe' });
  await expect(page.locator('.profile-switcher summary .profile-dot')).toHaveText('M');
  await expect(page.locator('.app-footer')).toContainText('Built for a trusted household network.');
  await expect(addRecipeTrigger).toHaveAttribute('href', '/?add=recipe');
  const touchTarget = await addRecipeTrigger.boundingBox();
  expect(touchTarget?.height).toBeGreaterThanOrEqual(44);
  await addRecipeTrigger.click();
  await expect(page).toHaveURL(/\?add=recipe$/u);
  const addRecipeDialog = page.getByRole('dialog', { name: 'How would you like to add it?' });
  await expect(addRecipeDialog).toBeVisible();
  await expect(addRecipeDialog.getByRole('link', { name: 'From scratch' })).toHaveAttribute(
    'href',
    '/recipes/new',
  );
  await expect(addRecipeDialog.getByRole('link', { name: 'Paste/AI Recipe' })).toHaveAttribute(
    'href',
    '/capture?mode=text',
  );
  await expect(addRecipeDialog.getByRole('link', { name: 'From URL' })).toHaveAttribute(
    'href',
    '/capture?mode=url',
  );
  await expect(addRecipeDialog.getByRole('link', { name: 'From Image' })).toHaveAttribute(
    'href',
    '/import',
  );
  expect(
    (
      await new AxeBuilder({ page })
        .include('.add-recipe-dialog-backdrop')
        .disableRules(['meta-viewport'])
        .analyze()
    ).violations,
  ).toEqual([]);
  await page.getByRole('link', { name: 'Close add recipe dialog' }).click();
  await expect(page).toHaveURL('/');

  await page.setViewportSize(surfaces[2].viewport);
  await page.getByRole('link', { name: 'Add a recipe' }).click();
  await expect(addRecipeDialog).toBeVisible();
  expect(
    await page.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth),
    'mobile add-recipe dialog should not horizontally overflow',
  ).toBe(true);
  await page.locator('.add-recipe-dialog-dismiss').click({ force: true, position: { x: 2, y: 2 } });
  await expect(addRecipeDialog).toBeHidden();
  await expect(page).toHaveURL('/');

  const mobileFilterToggle = page.getByRole('button', {
    name: 'Show recipe search and filters',
  });
  const homeRecipeFilters = page.locator('.home-recipe-filters');
  await expect(mobileFilterToggle).toBeVisible();
  await expect(homeRecipeFilters).toBeHidden();
  expect((await mobileFilterToggle.boundingBox())?.height).toBeGreaterThanOrEqual(44);
  await mobileFilterToggle.click();
  await expect(homeRecipeFilters).toBeVisible();
  await page.mouse.click(8, 500);
  await expect(homeRecipeFilters).toBeHidden();

  const profileMenu = page.locator('.profile-switcher');
  await expect(profileMenu).toHaveAttribute('data-dismissible-ready', 'true');
  await profileMenu.locator('summary').click();
  await expect(profileMenu).toHaveJSProperty('open', true);
  await expect(profileMenu.getByRole('menuitem', { name: 'Manage profiles' })).toHaveAttribute(
    'href',
    '/settings/profiles',
  );
  await page.mouse.click(8, 500);
  await expect(profileMenu).toHaveJSProperty('open', false);

  const mobileNavigation = page.locator('.mobile-navigation');
  await mobileNavigation.locator('summary').click();
  await expect(mobileNavigation).toHaveJSProperty('open', true);
  await expect(mobileNavigation.locator('nav > a')).toHaveText([
    'Recipebook',
    'Pantry',
    'Nutrition',
    'Planner',
    'Lists',
    'Settings',
  ]);
  await expect(mobileNavigation.getByRole('link', { name: 'Settings' })).toHaveAttribute(
    'href',
    '/settings',
  );
  await expect(page.getByRole('banner').getByRole('link', { name: 'App settings' })).toBeHidden();
  await page.mouse.click(8, 500);
  await expect(mobileNavigation).toHaveJSProperty('open', false);

  await page.setViewportSize(surfaces[0].viewport);
  await expect(mobileFilterToggle).toBeHidden();
  await expect(homeRecipeFilters).toBeVisible();
  const primaryNavigation = page.getByRole('navigation', { name: 'Primary navigation' });
  await expect(primaryNavigation.locator(':scope > a')).toHaveText([
    'Recipebook',
    'Pantry',
    'Nutrition',
    'Planner',
    'Lists',
  ]);
  await expect(page.getByRole('banner').getByLabel('Change color theme')).toHaveCount(0);
  await expect(primaryNavigation.getByRole('link', { name: 'Recipebook' })).toHaveAttribute(
    'href',
    '/recipes',
  );
  await expect(page.locator('.navigation-more')).toHaveCount(0);

  await page.goto('/collections');
  const createMenu = page.locator('.create-menu');
  const createMenuTrigger = createMenu.locator('summary');
  expect((await createMenuTrigger.boundingBox())?.height).toBeGreaterThanOrEqual(44);
  await createMenuTrigger.click();
  await expect(createMenu).toHaveJSProperty('open', true);
  await expect(createMenu.getByRole('menuitem')).toHaveText([
    'Recipe',
    'Meal Plan',
    'Nutrition Entry',
    'Shopping List',
  ]);
  await expect(createMenu.getByRole('menuitem', { name: 'Meal Plan' })).toHaveAttribute(
    'href',
    '/planner#meal-plan-setup-title',
  );
  await expect(createMenu.getByRole('menuitem', { name: 'Nutrition Entry' })).toHaveAttribute(
    'href',
    '/nutrition?view=diary',
  );
  await expect(createMenu.getByRole('menuitem', { name: 'Shopping List' })).toHaveAttribute(
    'href',
    '/lists#new-shopping-list',
  );
  await createMenu.getByRole('menuitem', { name: 'Recipe' }).click();
  await expect(addRecipeDialog).toBeVisible();
  await expect(page).toHaveURL('/collections');
  await page.getByRole('button', { name: 'Close add recipe dialog' }).click();
  await expect(addRecipeDialog).toBeHidden();
  await expect(page).toHaveURL('/collections');
  await createMenuTrigger.click();
  await createMenu.getByRole('menuitem', { name: 'Recipe' }).click();
  await page.locator('.add-recipe-dialog-dismiss').click({
    force: true,
    position: { x: 2, y: 2 },
  });
  await expect(addRecipeDialog).toBeHidden();
  await expect(page).toHaveURL('/collections');

  await page.getByRole('link', { name: 'App settings' }).click();
  await expect(page).toHaveURL('/settings');
  await expect(page.getByRole('heading', { name: 'Your kitchen, your way.' })).toBeVisible();
  await expect(page.locator('.app-footer')).toBeVisible();
  await expect(
    page.getByRole('banner').getByRole('link', { name: 'The Release Table home' }),
  ).toBeVisible();

  await page.goto('/planner');
  await expect(page.getByRole('heading', { name: 'This week at the table' })).toBeVisible();
  await expect(page.locator('.app-footer')).toBeHidden();
  await expect(
    page.getByRole('banner').getByRole('link', { name: 'The Release Table home' }),
  ).toBeVisible();

  await page.goto('/recipes');

  await expect(page).toHaveTitle('The Release Table');
  await expect(page.getByRole('heading', { name: 'Your recipe library' })).toBeVisible();
  await expect(page.getByRole('main').getByRole('link', { name: 'Collections' })).toHaveAttribute(
    'href',
    '/collections',
  );
  await expect(page.locator('body')).not.toBeEmpty();

  for (const surface of surfaces) {
    await page.setViewportSize(surface.viewport);
    await page.reload();
    await expect(page.getByRole('heading', { name: 'Your recipe library' })).toBeVisible();
    await expect(page.locator('.create-menu > summary')).toBeVisible();
    expect(
      await page.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth),
      `${surface.name} library viewport should not horizontally overflow`,
    ).toBe(true);

    if (surface.name !== 'tablet') {
      const screenshot = testInfo.outputPath(`library-${surface.name}.png`);
      await page.screenshot({ path: screenshot, fullPage: false });
      await testInfo.attach(`library-${surface.name}`, {
        path: screenshot,
        contentType: 'image/png',
      });
    }
  }

  await page.setViewportSize(surfaces[0].viewport);
  await page.goto('/recipes/new');
  const editorDesktop = await page.locator('.editor-form-layout').evaluate((form) => {
    const intro = form.querySelector(':scope > .editor-intro');
    const card = form.querySelector(':scope > .editor-card-column');
    const workingSection = form.querySelector(':scope > .recipe-form-section');
    const ingredientInput = form.querySelector('.ingredient-row input');
    const ingredientButton = form.querySelector('.ingredient-row .icon-button');
    if (!intro || !card || !workingSection || !ingredientInput || !ingredientButton) {
      throw new Error('Recipe editor layout targets are missing.');
    }
    return {
      formWidth: form.getBoundingClientRect().width,
      introWidth: intro.getBoundingClientRect().width,
      introRight: intro.getBoundingClientRect().right,
      cardLeft: card.getBoundingClientRect().left,
      workingSectionWidth: workingSection.getBoundingClientRect().width,
      ingredientInputHeight: ingredientInput.getBoundingClientRect().height,
      ingredientButtonHeight: ingredientButton.getBoundingClientRect().height,
    };
  });
  expect(editorDesktop.cardLeft).toBeGreaterThan(editorDesktop.introRight);
  expect(editorDesktop.workingSectionWidth / editorDesktop.formWidth).toBeGreaterThan(0.95);
  expect(editorDesktop.ingredientButtonHeight).toBeGreaterThanOrEqual(44);
  expect(
    Math.abs(editorDesktop.ingredientInputHeight - editorDesktop.ingredientButtonHeight),
  ).toBeLessThan(1);

  await page.setViewportSize(surfaces[2].viewport);
  await page.reload();
  expect(
    await page.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth),
    'mobile recipe editor should not horizontally overflow',
  ).toBe(true);
  const mobileCategoryToggle = page.getByRole('button', { name: 'Open categories options' });
  expect((await mobileCategoryToggle.boundingBox())?.height).toBeGreaterThanOrEqual(44);
  await mobileCategoryToggle.click();
  await expect(page.getByRole('listbox', { name: 'Categories options' })).toBeVisible();
  await page.mouse.click(2, 500);
  await expect(page.getByRole('listbox', { name: 'Categories options' })).toBeHidden();

  await page.setViewportSize(surfaces[0].viewport);
  await page.emulateMedia({ colorScheme: 'light' });
  await page.reload();
  const lightBackground = await page
    .locator('.recipe-page')
    .evaluate((element) => getComputedStyle(element).backgroundColor);
  await page.emulateMedia({ colorScheme: 'dark' });
  await page.goto('/recipes?surface=dark');
  await expect
    .poll(() => page.evaluate(() => matchMedia('(prefers-color-scheme: dark)').matches))
    .toBe(true);
  const darkBackground = await page
    .locator('.recipe-page')
    .evaluate((element) => getComputedStyle(element).backgroundColor);
  expect(darkBackground).not.toBe(lightBackground);
  await expect(page.getByRole('heading', { name: 'Your recipe library' })).toBeVisible();
  // Product requirement: the installed touch UI intentionally locks pinch zoom.
  expect(
    (await new AxeBuilder({ page }).disableRules(['meta-viewport']).analyze()).violations,
  ).toEqual([]);
  const darkScreenshot = testInfo.outputPath('library-dark.png');
  await page.screenshot({ path: darkScreenshot, fullPage: false });
  await testInfo.attach('library-dark', { path: darkScreenshot, contentType: 'image/png' });

  for (const colorScheme of ['light', 'dark'] as const) {
    await page.emulateMedia({ colorScheme });
    await page.goto('/');
    await expect(
      page.getByRole('heading', { name: 'Welcome to the kitchen, Maya.' }),
    ).toBeVisible();
    const contrast = await homeThemeContrast(page);
    expect(
      contrast.heading,
      `${colorScheme} hero heading should meet WCAG AA contrast`,
    ).toBeGreaterThanOrEqual(4.5);
    expect(
      contrast.planner,
      `${colorScheme} meal planner card should meet WCAG AA contrast`,
    ).toBeGreaterThanOrEqual(4.5);
  }

  await page.goto(recipeUrl);
  await page.emulateMedia({ media: 'screen', colorScheme: 'light' });
  const recipeToolbar = page.getByRole('toolbar', { name: 'Recipe actions' });
  await expect(recipeToolbar.getByRole('link', { name: 'Cook this recipe' })).toBeVisible();
  await expect(recipeToolbar.getByRole('link', { name: 'Edit recipe' })).toBeVisible();
  await expect(recipeToolbar.getByRole('button', { name: 'Print recipe card' })).toBeVisible();
  const exportMenu = page.locator('.recipe-export-menu');
  await exportMenu.locator('summary').click();
  await expect(exportMenu.getByRole('link', { name: 'Download JSON-LD' })).toBeVisible();
  await expect(exportMenu.getByRole('button', { name: 'Copy JSON-LD' })).toBeVisible();
  await expect(exportMenu.getByRole('link', { name: 'Download Markdown' })).toBeVisible();
  await expect(exportMenu.getByRole('button', { name: 'Copy Markdown' })).toBeVisible();
  await exportMenu.getByRole('button', { name: 'Copy JSON-LD' }).click();
  await expect(page.locator('.toast')).toContainText('JSON-LD copied to the clipboard.');
  await expect(exportMenu).toHaveJSProperty('open', false);
  await exportMenu.locator('summary').click();
  await page.mouse.click(8, 500);
  await expect(exportMenu).toHaveJSProperty('open', false);
  await expect(
    page.getByText('Imported or manual legacy Nutrition', { exact: true }),
  ).toBeVisible();
  await page.getByText('Review source values', { exact: true }).click();
  await expect(page.getByText('230 kcal', { exact: true })).toBeVisible();
  await expect(page.getByRole('button', { name: 'Estimate from AI' })).toHaveCount(0);
  const classificationToolbar = page.getByRole('region', { name: 'Recipe details and tags' });
  await expect(classificationToolbar.getByText('Dinner', { exact: true })).toBeVisible();
  await expect(classificationToolbar.getByText('Main Dish', { exact: true })).toBeVisible();
  await expect(classificationToolbar.getByText('Italian', { exact: true })).toBeVisible();
  await expect(classificationToolbar.getByText('Family Table', { exact: true })).toBeVisible();
  await classificationToolbar.getByLabel('Add a tag').fill('Weeknight');
  await classificationToolbar.getByRole('button', { name: 'Attach tag' }).click();
  await expect(page.locator('.toast').filter({ hasText: 'Weeknight tag added.' })).toBeVisible();
  await expect(classificationToolbar.getByText('Weeknight', { exact: true })).toBeVisible();
  await classificationToolbar.getByRole('button', { name: 'Remove weeknight tag' }).click();
  await expect(page.locator('.toast').filter({ hasText: 'Weeknight tag removed.' })).toBeVisible();
  await expect(classificationToolbar.getByText('Weeknight', { exact: true })).toHaveCount(0);

  const imageUpload = page.locator('#recipe-image-upload');
  const tinyRecipePhoto = await sharp({
    create: { width: 2, height: 2, channels: 3, background: '#9f482f' },
  })
    .png()
    .toBuffer();
  await page.getByRole('button', { name: 'Add/manage photos' }).click();
  await imageUpload.setInputFiles({
    name: 'tomato.png',
    mimeType: 'image/png',
    buffer: tinyRecipePhoto,
  });
  await page.getByRole('button', { name: 'Upload photo' }).click();
  await expect(page.locator('.toast').filter({ hasText: 'Recipe photo added.' })).toBeVisible();
  await expect(page.locator('.recipe-image-grid img')).toBeVisible();
  await expect(page.locator('#recipe-image-editor')).toBeHidden();
  const imageEditButton = page.getByRole('button', { name: 'Edit recipe photos from photo 1' });
  await expect(imageEditButton).toBeVisible();
  await expect(page.getByRole('button', { name: 'Remove photo 1' })).toBeVisible();
  await imageEditButton.click();
  await expect(page.locator('#recipe-image-editor')).toBeVisible();
  await imageEditButton.click();
  await expect(page.locator('#recipe-image-editor')).toBeHidden();

  const maintenancePanel = page.getByRole('region', { name: 'Recipe management' });
  await expect(maintenancePanel).toBeVisible();
  await maintenancePanel.getByText('Revision history', { exact: true }).click();
  await expect(maintenancePanel.getByText('3 saved versions', { exact: true })).toBeVisible();
  await expect(
    maintenancePanel.locator('ol strong').getByText('Revision 3', { exact: true }),
  ).toBeVisible();
  await page.getByRole('button', { name: 'Decrease servings' }).click();
  await page.getByRole('button', { name: 'Decrease servings' }).click();
  await expect(page.getByLabel('Selected servings')).toHaveText('2');
  await expect(page.locator('.ingredient-quantity')).toHaveText('2 tbsp');

  await page.setViewportSize(surfaces[2].viewport);
  expect(
    await page.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth),
    'mobile recipe detail should not horizontally overflow',
  ).toBe(true);
  for (const control of await recipeToolbar
    .locator(
      ':scope > .recipe-toolbar-primary, :scope > .recipe-toolbar-button, :scope > .recipe-export-menu > summary',
    )
    .all()) {
    expect((await control.boundingBox())?.height).toBeGreaterThanOrEqual(44);
  }
  expect((await imageEditButton.boundingBox())?.height).toBeGreaterThanOrEqual(44);
  const dismissNotification = page.getByRole('button', { name: 'Dismiss notification' });
  while ((await dismissNotification.count()) > 0) await dismissNotification.first().click();
  await maintenancePanel.locator('.recipe-maintenance-heading').scrollIntoViewIfNeeded();
  const mobileRecipeScreenshot = testInfo.outputPath('recipe-detail-mobile.png');
  await page.screenshot({ path: mobileRecipeScreenshot, fullPage: false });
  await testInfo.attach('recipe-detail-mobile', {
    path: mobileRecipeScreenshot,
    contentType: 'image/png',
  });

  await page.emulateMedia({ media: 'print', colorScheme: 'light' });
  await expect(page.getByRole('heading', { name: 'Print-ready tomato soup' })).toBeVisible();
  await expect(page.locator('.recipe-detail-toolbar')).toHaveCSS('display', 'none');
  await expect(page.locator('.recipe-media')).toHaveCSS('display', 'none');
  await expect(page.locator('.app-footer')).toHaveCSS('display', 'none');

  for (const format of ['Letter', 'A4'] as const) {
    const pdf = await page.pdf({ format, printBackground: true });
    expect(pdf.byteLength, `${format} recipe PDF should contain rendered content`).toBeGreaterThan(
      1_000,
    );
    await testInfo.attach(`recipe-${format.toLowerCase()}`, {
      body: pdf,
      contentType: 'application/pdf',
    });
  }

  await page.emulateMedia({ media: 'screen', colorScheme: 'light' });
  await page.setViewportSize(surfaces[2].viewport);
  await page.goto('/recipes/new');
  await page.getByLabel('Recipe name').fill('Nutrition estimate test soup');
  await page.getByLabel('Serves').fill('4 servings');
  await page.getByLabel('Ingredient 1-1 quantity').fill('2');
  await page.getByLabel('Ingredient 1-1 item').fill('tomatoes');
  await page.getByLabel('Method section 1, step 1').fill('Simmer gently.');
  await page.getByRole('button', { name: 'Add to the cookbook' }).click();
  await expect(page.getByRole('heading', { name: 'Nutrition estimate test soup' })).toBeVisible();

  let estimateRequestStarted = false;
  let releaseEstimateResponse = () => {};
  await page.route('**/api/v1/recipes/*/nutrition/estimate', async (route) => {
    await new Promise<void>((resolve) => {
      estimateRequestStarted = true;
      releaseEstimateResponse = resolve;
    });
    await route.fulfill({
      status: 503,
      contentType: 'application/json',
      body: JSON.stringify({
        error: { message: 'OpenAI is not configured for this test.' },
      }),
    });
  });

  await page.getByText('Review source values', { exact: true }).click();
  const estimateButton = page.getByRole('button', { name: 'Estimate from AI' });
  await expect(estimateButton).toBeVisible();
  expect((await estimateButton.boundingBox())?.height).toBeGreaterThanOrEqual(44);
  expect(
    await page.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth),
    'mobile nutrition estimate panel should not horizontally overflow',
  ).toBe(true);
  await estimateButton.click();
  await expect.poll(() => estimateRequestStarted).toBe(true);
  await expect(page.getByRole('button', { name: 'Estimating with OpenAI…' })).toBeDisabled();
  await expect(page.locator('.nutrition-panel')).toHaveAttribute('aria-busy', 'true');
  releaseEstimateResponse();
  await expect(
    page.locator('.toast').filter({ hasText: 'OpenAI is not configured for this test.' }),
  ).toBeVisible();
  await expect(estimateButton).toBeVisible();
  await expect(page.locator('.nutrition-panel')).toHaveAttribute('aria-busy', 'false');

  await page.unroute('**/api/v1/recipes/*/nutrition/estimate');
  const nutritionRecipeUrl = page.url();
  await page.context().clearCookies();
  await page.goto(`${nutritionRecipeUrl}/edit`);
  await expect(page.locator('.profile-switcher summary .profile-dot')).toHaveText('M');
  const editCategoryInput = page.getByRole('combobox', { name: 'Categories (optional)' });
  await editCategoryInput.fill('Weeknight favorite');
  await editCategoryInput.press('Enter');
  await expect(
    page.getByRole('button', { name: 'Remove Weeknight favorite from categories' }),
  ).toBeVisible();
  await expect(page.getByText('Choose a household profile before editing a recipe.')).toHaveCount(
    0,
  );

  const tagInput = page.getByPlaceholder('Add a tag');
  await tagInput.fill('comfort food');
  await tagInput.press('Enter');
  const comfortTag = page.getByRole('button', { name: 'Remove comfort food tag' });
  await expect(comfortTag).toBeVisible();
  expect((await comfortTag.boundingBox())?.height).toBeGreaterThanOrEqual(44);
  await comfortTag.click();
  await expect(comfortTag).toHaveCount(0);

  let improveRequestStarted = false;
  let releaseImproveResponse = () => {};
  await page.route('**/api/v1/recipes/*/improve', async (route) => {
    const request = route.request().postDataJSON() as {
      recipe: Record<string, unknown> & {
        ingredientGroups: unknown[];
      };
    };
    await new Promise<void>((resolve) => {
      improveRequestStarted = true;
      releaseImproveResponse = resolve;
    });
    await route.fulfill({
      status: 201,
      contentType: 'application/json',
      body: JSON.stringify({
        candidate: {
          recipe: {
            ...request.recipe,
            summary: 'A clearer AI-improved test recipe.',
            prepMinutes: 5,
            tags: ['weeknight', 'tomato'],
            instructionSections: [
              {
                title: 'Cook',
                steps: ['Simmer the tomatoes gently until fragrant and warmed through.'],
              },
            ],
            ingredientGroups: request.recipe.ingredientGroups,
          },
          confidence: 0.8,
          warnings: ['Review this deterministic test suggestion.'],
          uncertainSegments: [],
        },
      }),
    });
  });

  const improveButton = page.getByRole('button', { name: 'AI Improve' });
  await expect(improveButton).toBeVisible();
  expect((await improveButton.boundingBox())?.height).toBeGreaterThanOrEqual(44);
  await improveButton.click();
  await expect.poll(() => improveRequestStarted).toBe(true);
  await expect(page.getByRole('button', { name: 'Improving with OpenAI…' })).toBeDisabled();
  releaseImproveResponse();
  await expect(
    page.locator('.toast').filter({
      hasText: 'AI improvement draft ready. Review the changes, then save a new revision.',
    }),
  ).toBeVisible();
  await expect(page.getByLabel('Ingredient 1-1 quantity')).toHaveValue('2');
  await expect(page.getByLabel('Ingredient 1-1 item')).toHaveValue('tomatoes');
  await expect(page.getByLabel('Method section 1, step 1')).toHaveValue(
    'Simmer the tomatoes gently until fragrant and warmed through.',
  );
  await expect(page.getByRole('button', { name: 'Remove weeknight tag' })).toBeVisible();
  expect(
    await page.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth),
    'mobile AI-improved editor should not horizontally overflow',
  ).toBe(true);
  const improvedEditorScreenshot = testInfo.outputPath('recipe-editor-ai-improved-mobile.png');
  await page.screenshot({ path: improvedEditorScreenshot, fullPage: false });
  await testInfo.attach('recipe-editor-ai-improved-mobile', {
    path: improvedEditorScreenshot,
    contentType: 'image/png',
  });

  await page.getByRole('button', { name: 'Save a new revision' }).click();
  await expect(page.getByRole('heading', { name: 'Nutrition estimate test soup' })).toBeVisible();
  await expect(page.locator('.recipe-revision-badge')).toHaveText('Revision 2');
  await expect(page.getByText('Choose a household profile before editing a recipe.')).toHaveCount(
    0,
  );

  expect(
    consoleErrors.filter((message) => !message.includes('server responded with a status of 503')),
  ).toEqual([]);
});
