import AxeBuilder from '@axe-core/playwright';
import { expect, test } from '@playwright/test';

const surfaces = [
  { name: 'desktop', viewport: { width: 1440, height: 900 } },
  { name: 'tablet', viewport: { width: 768, height: 1024 } },
  { name: 'mobile', viewport: { width: 390, height: 844 } },
] as const;

async function homeThemeContrast(page: import('@playwright/test').Page): Promise<{
  heading: number;
  notice: number;
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
    const notice = document.querySelector('.trust-card');
    if (!heading || !notice) throw new Error('Home contrast targets are missing.');

    return {
      heading: contrast(getComputedStyle(heading).color, root.getPropertyValue('--page')),
      notice: contrast(getComputedStyle(notice).color, getComputedStyle(notice).backgroundColor),
    };
  });
}

async function createRecipeForReview(page: import('@playwright/test').Page): Promise<void> {
  await page.goto('/');
  await page.getByLabel('Household name').fill('The Release Table');
  await page.getByLabel('Display name').fill('Maya');
  await page.getByRole('button', { name: 'Open the cookbook' }).click();
  await page.goto('/recipes/new');
  await page.getByLabel('Recipe name').fill('Print-ready tomato soup');
  await page.getByLabel('Ingredient 1-1 item').fill('tomatoes');
  await page.getByLabel('Method section 1, step 1').fill('Simmer gently.');
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
  await page.goto('/recipes');

  await expect(page).toHaveTitle('Our Recipes');
  await expect(page.getByRole('heading', { name: 'Your recipe library' })).toBeVisible();
  await expect(page.locator('body')).not.toBeEmpty();

  for (const surface of surfaces) {
    await page.setViewportSize(surface.viewport);
    await page.reload();
    await expect(page.getByRole('heading', { name: 'Your recipe library' })).toBeVisible();
    await expect(page.getByRole('link', { name: 'Add a recipe' })).toBeVisible();
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
  const editorDesktop = await page.locator('.editor-layout').evaluate((layout) => {
    const form = document.querySelector('.recipe-form');
    const intro = layout.firstElementChild;
    if (!form || !intro) throw new Error('Recipe editor layout targets are missing.');
    return {
      layoutWidth: layout.getBoundingClientRect().width,
      formWidth: form.getBoundingClientRect().width,
      introWidth: intro.getBoundingClientRect().width,
    };
  });
  expect(editorDesktop.formWidth).toBeGreaterThan(editorDesktop.introWidth);
  expect(editorDesktop.formWidth / editorDesktop.layoutWidth).toBeGreaterThan(0.58);

  await page.setViewportSize(surfaces[2].viewport);
  await page.reload();
  expect(
    await page.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth),
    'mobile recipe editor should not horizontally overflow',
  ).toBe(true);

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
  expect((await new AxeBuilder({ page }).analyze()).violations).toEqual([]);
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
      contrast.notice,
      `${colorScheme} profile notice should meet WCAG AA contrast`,
    ).toBeGreaterThanOrEqual(4.5);
  }

  await page.goto(recipeUrl);
  await page.emulateMedia({ media: 'print', colorScheme: 'light' });
  await expect(page.getByRole('heading', { name: 'Print-ready tomato soup' })).toBeVisible();
  await expect(page.locator('.recipe-header')).toHaveCSS('display', 'none');

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

  expect(consoleErrors).toEqual([]);
});
