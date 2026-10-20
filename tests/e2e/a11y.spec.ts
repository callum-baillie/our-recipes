import { appAxe as axe } from './helpers/accessibility';
import { expect, test } from '@playwright/test';
import sharp from 'sharp';

import { onboardingEmail, TEST_PASSPHRASE } from './helpers/onboarding';

test('first-run setup and household organization have no automatically detectable accessibility violations', async ({
  page,
}, testInfo) => {
  testInfo.setTimeout(180_000);
  await page.goto('/');
  await expect(page.getByRole('heading', { level: 1 })).toBeVisible();
  await expect(page.getByLabel('Kitchen name')).toBeVisible();
  const setupResults = await axe(page).analyze();
  expect(setupResults.violations).toEqual([]);

  await page.getByLabel('Kitchen name').fill('The Garden Table');
  await page.getByRole('button', { name: 'Continue' }).click();
  await page.getByRole('button', { name: 'Continue' }).click();
  await page.getByLabel('Display name').fill('Callum');
  await page
    .getByRole('textbox', { name: /^Email\b/ })
    .fill(onboardingEmail('The Garden Table', 'Callum'));
  await page.getByLabel(/^\s*Passphrase/).fill(TEST_PASSPHRASE);
  await page.getByRole('button', { name: 'Continue' }).click();
  await page.getByRole('button', { name: 'Set up nutrition later' }).click();
  await page.getByRole('button', { name: 'Continue' }).click();
  await page.getByRole('button', { name: 'Continue' }).click();
  await page.getByRole('button', { name: 'Add Stovies & open recipe' }).click();
  await page.getByLabel('I saved these one-time codes somewhere private.').check();
  await page.getByRole('button', { name: 'Continue to sign in' }).click();
  await page
    .getByRole('textbox', { name: /^Email\b/ })
    .fill(onboardingEmail('The Garden Table', 'Callum'));
  await page.getByLabel(/^\s*Passphrase/).fill(TEST_PASSPHRASE);
  await page.getByRole('button', { name: 'Sign in', exact: true }).click();
  await page.waitForURL((url) => url.pathname.startsWith('/recipes/'));

  await page.goto('/settings/profiles');
  await expect(page.getByRole('heading', { name: 'Household members & roles' })).toBeVisible();
  const profileResults = await axe(page).analyze();
  expect(profileResults.violations).toEqual([]);
  await page.getByRole('button', { name: 'Add profile', exact: true }).click();
  const profileOnboarding = page.getByRole('dialog', { name: 'New profile onboarding' });
  await expect(profileOnboarding).toBeVisible();
  const profileOnboardingResults = await axe(page).include('#profile-onboarding-dialog').analyze();
  expect(profileOnboardingResults.violations).toEqual([]);
  await profileOnboarding.getByLabel('Display name').fill('Jon');
  await profileOnboarding.getByRole('textbox', { name: /^Email\b/ }).fill('jon-a11y@example.test');
  await profileOnboarding.getByLabel(/^\s*Passphrase/).fill(TEST_PASSPHRASE);
  await profileOnboarding.getByRole('button', { name: 'Continue' }).click();
  await profileOnboarding.getByRole('button', { name: 'Set up nutrition later' }).click();
  await profileOnboarding.getByRole('button', { name: 'Continue' }).click();
  await profileOnboarding.getByRole('button', { name: 'Create profile' }).click();
  await profileOnboarding.getByLabel('I saved these one-time codes somewhere private.').check();
  await profileOnboarding.getByRole('button', { name: 'Finish profile setup' }).click();

  await page.goto('/recipes/new');
  await page.locator('.editor-optional').evaluateAll((nodes) =>
    nodes.forEach((node) => {
      (node as HTMLDetailsElement).open = true;
    }),
  );
  await page.getByLabel('Recipe name').fill('Accessible rich soup');
  await page.getByLabel('Ingredient 1-1 item').fill('tomatoes');
  await page.getByLabel('Method section 1, step 1').fill('Simmer.');
  await page.getByLabel('Equipment (one item per line, optional)').fill('Large pot');
  await page.getByLabel('Calories (kcal)').fill('180');
  await page.getByRole('button', { name: 'Add recipe', exact: true }).last().click();
  await expect(page.getByRole('heading', { name: 'Accessible rich soup' })).toBeVisible();
  const recipeDetailResults = await axe(page).analyze();
  expect(recipeDetailResults.violations).toEqual([]);

  await page.goto('/tags');
  const tagResults = await axe(page).analyze();
  expect(tagResults.violations).toEqual([]);

  await page.goto('/collections');
  const collectionResults = await axe(page).analyze();
  expect(collectionResults.violations).toEqual([]);
  await page.getByLabel('Collection name').fill('Weeknight keepers');
  await page.getByRole('button', { name: 'Create collection' }).click();
  await page.getByRole('link', { name: 'Open collection' }).click();
  await expect(page.getByRole('heading', { name: 'Weeknight keepers', level: 1 })).toBeVisible();
  const collectionDetailResults = await axe(page).analyze();
  expect(collectionDetailResults.violations).toEqual([]);

  await page.goto('/import');
  const handwrittenRecipe = await sharp({
    create: { width: 4, height: 4, channels: 3, background: '#f2e2bd' },
  })
    .png()
    .toBuffer();
  const fileChooser = page.waitForEvent('filechooser');
  await page.locator('label[for="recipe-import-files"]').click();
  await (
    await fileChooser
  ).setFiles({
    name: 'grandmas-lemon-pasta.png',
    mimeType: 'image/png',
    buffer: handwrittenRecipe,
  });
  await expect(page.getByRole('button', { name: 'Send to OpenAI and create draft' })).toBeEnabled();
  await page.getByText('Add your own transcription').click();
  await page
    .getByLabel('Manual transcription (optional)')
    .fill(
      'Lemon pasta\nIngredients\n2 tbsp olive oil\n1 lemon\nMethod\n1. Toss the pasta with lemon and oil.',
    );
  await page.getByRole('button', { name: 'Create review draft' }).click();
  await expect(page.getByText('Review before saving')).toBeVisible();
  const importReviewResults = await axe(page).analyze();
  expect(importReviewResults.violations).toEqual([]);

  await page.goto('/import');
  await page.getByRole('button', { name: /Structured recipe data \(JSON-LD\)/ }).click();
  await page.getByLabel('Schema.org JSON-LD').fill(
    JSON.stringify({
      '@context': 'https://schema.org',
      '@type': 'Recipe',
      name: 'Accessible JSON-LD soup',
      recipeYield: '4 servings',
      recipeIngredient: ['1 onion'],
      recipeInstructions: ['Simmer.'],
    }),
  );
  await page.getByRole('button', { name: 'Find Recipe candidates' }).click();
  const jsonLdCandidateResults = await axe(page).analyze();
  expect(jsonLdCandidateResults.violations).toEqual([]);

  await page.goto('/capture');
  await page.route('**/api/v1/capture-drafts', async (route) => {
    await route.fulfill({
      contentType: 'application/json',
      body: JSON.stringify({
        candidates: [
          {
            index: 0,
            title: 'Accessible URL soup',
            summary: 'A structured page candidate.',
            source: 'schema-jsonld',
            warnings: [],
          },
        ],
      }),
    });
  });
  await page.getByRole('button', { name: 'Recipe link', exact: true }).click();
  await page.getByLabel('Public recipe URL').fill('https://recipes.example.test/soup');
  await page.getByRole('button', { name: 'Import recipe with AI' }).click();
  const urlCandidateResults = await axe(page).analyze();
  expect(urlCandidateResults.violations).toEqual([]);
});

test('offline fallback has no automatically detectable accessibility violations', async ({
  page,
}) => {
  await page.goto('/offline');
  const results = await axe(page).analyze();
  expect(results.violations).toEqual([]);
});
