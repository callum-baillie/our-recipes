import AxeBuilder from '@axe-core/playwright';
import { expect, test } from '@playwright/test';
import sharp from 'sharp';

test('first-run setup and household organization have no automatically detectable accessibility violations', async ({
  page,
}) => {
  await page.goto('/');
  const setupResults = await new AxeBuilder({ page }).analyze();
  expect(setupResults.violations).toEqual([]);

  await page.getByLabel('Household name').fill('The Garden Table');
  await page.getByLabel('Display name').fill('Callum');
  await page.getByRole('button', { name: 'Open the cookbook' }).click();

  await page.goto('/settings/profiles');
  const profileResults = await new AxeBuilder({ page }).analyze();
  expect(profileResults.violations).toEqual([]);
  await page.getByRole('button', { name: 'Add another profile' }).click();
  await page.getByLabel('Display name').last().fill('Jon');
  await page.getByRole('button', { name: 'Create profile' }).click();

  await page.goto('/recipes/new');
  await page.getByLabel('Recipe name').fill('Accessible rich soup');
  await page.getByLabel('Ingredient 1-1 item').fill('tomatoes');
  await page.getByLabel('Method section 1, step 1').fill('Simmer.');
  await page.getByLabel('Equipment (one item per line, optional)').fill('Large pot');
  await page.getByLabel('Calories (kcal)').fill('180');
  await page.getByRole('button', { name: 'Add to the cookbook' }).click();
  await expect(page.getByRole('heading', { name: 'Accessible rich soup' })).toBeVisible();
  const recipeDetailResults = await new AxeBuilder({ page }).analyze();
  expect(recipeDetailResults.violations).toEqual([]);

  await page.goto('/tags');
  const tagResults = await new AxeBuilder({ page }).analyze();
  expect(tagResults.violations).toEqual([]);

  await page.goto('/collections');
  const collectionResults = await new AxeBuilder({ page }).analyze();
  expect(collectionResults.violations).toEqual([]);
  await page.getByLabel('Collection name').fill('Weeknight keepers');
  await page.getByRole('button', { name: 'Create collection' }).click();
  await page.getByRole('link', { name: 'Open collection' }).click();
  const collectionDetailResults = await new AxeBuilder({ page }).analyze();
  expect(collectionDetailResults.violations).toEqual([]);

  await page.goto('/import');
  const handwrittenRecipe = await sharp({
    create: { width: 4, height: 4, channels: 3, background: '#f2e2bd' },
  })
    .png()
    .toBuffer();
  await page.getByLabel('Recipe document or scan').setInputFiles({
    name: 'grandmas-lemon-pasta.png',
    mimeType: 'image/png',
    buffer: handwrittenRecipe,
  });
  await expect(page.getByRole('button', { name: 'Create OpenAI review draft' })).toBeEnabled();
  await page.getByText('Add your own transcription').click();
  await page
    .getByLabel('Manual transcription (optional)')
    .fill(
      'Lemon pasta\nIngredients\n2 tbsp olive oil\n1 lemon\nMethod\n1. Toss the pasta with lemon and oil.',
    );
  await page.getByRole('button', { name: 'Create review draft' }).click();
  await expect(page.getByText('Review before saving')).toBeVisible();
  const importReviewResults = await new AxeBuilder({ page }).analyze();
  expect(importReviewResults.violations).toEqual([]);

  await page.goto('/import');
  await page.getByRole('button', { name: /Paste Schema\.org JSON-LD/ }).click();
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
  const jsonLdCandidateResults = await new AxeBuilder({ page }).analyze();
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
  await page.getByRole('tab', { name: 'Public URL' }).click();
  await page.getByLabel('Public recipe URL').fill('https://recipes.example.test/soup');
  await page.getByRole('button', { name: 'Create review draft' }).click();
  const urlCandidateResults = await new AxeBuilder({ page }).analyze();
  expect(urlCandidateResults.violations).toEqual([]);
});

test('offline fallback has no automatically detectable accessibility violations', async ({
  page,
}) => {
  await page.goto('/offline');
  const results = await new AxeBuilder({ page }).analyze();
  expect(results.violations).toEqual([]);
});
