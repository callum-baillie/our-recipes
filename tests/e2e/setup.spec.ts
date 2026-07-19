import { expect, test } from '@playwright/test';
import sharp from 'sharp';

import { HEIC_FIXTURES } from './fixtures/heic-fixtures';

test('portable recipe export requires an active local profile and a trusted explicit origin', async ({
  page,
}) => {
  await page.goto('/');
  expect((await page.request.get('/api/v1/exports/recipes')).status()).toBe(409);
  expect(
    (
      await page.request.get('/api/v1/exports/recipes', {
        headers: { Origin: 'https://untrusted.example.test' },
      })
    ).status(),
  ).toBe(403);
});

test('AI settings expose only a safe configuration state', async ({ page }) => {
  const response = await page.request.get('/api/v1/ai/status');
  expect(response.ok()).toBe(true);
  const body = (await response.json()) as {
    status: { provider: string; state: string; enabled: boolean; message: string };
  };
  expect(body).toMatchObject({
    status: { provider: 'OpenAI', state: expect.any(String), enabled: expect.any(Boolean) },
  });
  expect(body.status.state === 'configured').toBe(body.status.enabled);
  expect(JSON.stringify(body)).not.toMatch(/sk-(?:proj-)?/u);
});

test('a fresh household can complete the supported local release acceptance workflow', async ({
  page,
}, testInfo) => {
  // This intentionally covers the full supported household workflow. It takes
  // longer than Playwright's default in a fresh Linux CI environment.
  testInfo.setTimeout(180_000);
  await page.goto('/');
  await expect(page.getByRole('heading', { name: 'Make this kitchen yours.' })).toBeVisible();
  await page.getByLabel('Household name').fill('The Garden Table');
  await page.getByLabel('Display name').fill('Callum');
  await page.getByRole('button', { name: 'Open the cookbook' }).click();
  await expect(
    page.getByRole('heading', { name: 'Welcome to the kitchen, Callum.' }),
  ).toBeVisible();
  await expect(page.getByRole('heading', { name: 'Make the week feel lighter.' })).toBeVisible();
  await page.goto('/settings/ai');
  await expect(page).toHaveURL('/settings#ai');
  await expect(page.getByRole('heading', { name: 'Your kitchen, your way.' })).toBeVisible();
  const aiStatus = (await (await page.request.get('/api/v1/ai/status')).json()) as {
    status: { message: string };
  };
  await expect(page.locator('#ai').getByRole('status')).toHaveText(aiStatus.status.message);
  await page.goto('/recipes/new');
  await expect(page.getByRole('heading', { name: 'Add it your way.' })).toBeVisible();
  await expect(page.getByLabel('Recipe name')).toBeVisible();
  await page.goto('/settings/profiles');
  await expect(page.getByRole('heading', { name: 'The people around the table.' })).toBeVisible();
  await page.getByRole('button', { name: 'Add another profile' }).click();
  await page.getByLabel('Display name').last().fill('Jon');
  await page.getByRole('button', { name: 'Create profile' }).click();
  await expect(page.getByRole('heading', { name: 'Jon' })).toBeVisible();
  const jonProfile = page.locator('.profile-editor', {
    has: page.getByRole('heading', { name: 'Jon', exact: true }),
  });
  await jonProfile.getByRole('button', { name: 'Archive' }).click();
  await expect(jonProfile.getByText('Archived', { exact: true })).toBeVisible();
  await jonProfile.getByRole('button', { name: 'Restore' }).click();
  await expect(jonProfile.getByText('Archived', { exact: true })).not.toBeVisible();
  await page.goto('/tags');
  await expect(page.getByRole('heading', { name: 'Tags with a little order.' })).toBeVisible();
  await page.getByLabel('Tag name').fill('freezer-friendly');
  await page.getByRole('button', { name: 'Add tag' }).click();
  await expect(page.getByText('freezer-friendly', { exact: true })).toBeVisible();
  await page.getByLabel('Tag name').fill('weeknight');
  await page.getByRole('button', { name: 'Add tag' }).click();
  const freezerTag = page.locator('.tag-row', { hasText: 'freezer-friendly' });
  await freezerTag.getByLabel('Rename freezer-friendly').fill('freezer');
  await freezerTag.getByRole('button', { name: 'Save' }).click();
  await expect(page.getByText('freezer', { exact: true })).toBeVisible();
  const renamedFreezerTag = page.locator('.tag-row', { hasText: 'freezer' });
  await renamedFreezerTag.getByLabel('Merge freezer into').fill('weeknight');
  await renamedFreezerTag.getByRole('button', { name: 'Merge' }).click();
  await expect(page.getByText('freezer', { exact: true })).not.toBeVisible();
  const weeknightTag = page.locator('.tag-row', { hasText: 'weeknight' });
  page.once('dialog', (dialog) => dialog.accept());
  await weeknightTag.getByRole('button', { name: 'Remove' }).click();
  await expect(page.getByText('weeknight', { exact: true })).not.toBeVisible();
  await page.setViewportSize({ width: 390, height: 844 });
  await page.goto('/import');
  await expect(page.getByRole('heading', { name: 'Add from an image.' })).toBeVisible();
  let visionRequest: unknown;
  await page.route('**/api/v1/ai/reviews', async (route) => {
    visionRequest = route.request().postDataJSON();
    await new Promise((resolve) => setTimeout(resolve, 750));
    await route.fulfill({
      contentType: 'application/json',
      body: JSON.stringify({
        candidate: {
          recipe: {
            title: 'Lemon pasta',
            summary: '',
            status: 'active',
            servings: '4 servings',
            prepMinutes: 10,
            cookMinutes: 25,
            restMinutes: 0,
            difficulty: '',
            cuisine: '',
            category: '',
            tips: '',
            sharedNotes: '',
            sourceName: '',
            sourceUrl: '',
            originalAuthor: '',
            cookingMethod: '',
            equipment: [],
            nutritionCalories: '',
            nutritionProteinGrams: '',
            nutritionCarbohydrateGrams: '',
            nutritionFatGrams: '',
            nutritionSaturatedFatGrams: '',
            nutritionFiberGrams: '',
            nutritionSugarGrams: '',
            nutritionSodiumMilligrams: '',
            tags: [],
            ingredientGroups: [
              {
                name: '',
                ingredients: [
                  { quantity: 2, unit: 'tbsp', item: 'olive oil', note: '' },
                  { quantity: 1, unit: '', item: 'lemon', note: '' },
                ],
              },
            ],
            instructionSections: [{ title: '', steps: ['Toss the pasta with lemon and oil.'] }],
          },
          confidence: 0.8,
          warnings: [],
          uncertainSegments: [],
        },
      }),
    });
  });
  const recipeDocumentInput = page.getByLabel('Recipe document or scan');
  const mobilePng = await sharp({
    create: { width: 8, height: 8, channels: 3, background: '#9f482f' },
  })
    .png()
    .toBuffer();
  await recipeDocumentInput.setInputFiles({
    name: 'mobile-recipe.png',
    mimeType: 'image/png',
    buffer: mobilePng,
  });
  await expect(
    page
      .getByRole('region', { name: 'Notifications' })
      .getByText('1 photo received. Preparing it on this device…'),
  ).toBeVisible();
  const mobilePngPreview = page.getByRole('img', { name: 'Preview of mobile-recipe.png' });
  await expect(mobilePngPreview).toBeVisible();
  await expect
    .poll(() => mobilePngPreview.evaluate((image) => (image as HTMLImageElement).naturalWidth))
    .toBe(8);
  await expect(page.getByRole('button', { name: 'Send to OpenAI and create draft' })).toBeEnabled();
  expect(
    await page.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth),
    'mobile image import should not horizontally overflow',
  ).toBe(true);

  await recipeDocumentInput.setInputFiles({
    name: 'unsupported.gif',
    mimeType: 'image/gif',
    buffer: Buffer.from('GIF89a'),
  });
  await expect(
    page.getByRole('main').getByText('Choose JPEG, PNG, WebP, HEIC, HEIF, or PDF files.'),
  ).toBeVisible();
  await expect(
    page
      .getByRole('region', { name: 'Notifications' })
      .getByText('Choose JPEG, PNG, WebP, HEIC, HEIF, or PDF files.'),
  ).toBeVisible();
  await expect(page.getByText(/PDFs use local text extraction first/)).toBeHidden();
  await expect(page.getByRole('button', { name: 'Choose another file' })).toBeEnabled();

  await page.evaluate((fixture) => {
    const input = document.querySelector<HTMLInputElement>('#recipe-import-files');
    if (!input) throw new Error('Recipe file input is missing.');
    const bytes = Uint8Array.from(atob(fixture.data), (character) => character.charCodeAt(0));
    const transfer = new DataTransfer();
    transfer.items.add(
      new File([bytes], fixture.name, {
        type: fixture.mimeType,
        lastModified: Date.now(),
      }),
    );
    Object.defineProperty(input, 'files', { configurable: true, value: transfer.files });
    input.dispatchEvent(new Event('input', { bubbles: true }));
    Reflect.deleteProperty(input, 'files');
  }, HEIC_FIXTURES.heic);
  await expect(
    page
      .getByRole('region', { name: 'Notifications' })
      .getByText('1 photo received. Preparing it on this device…'),
  ).toBeVisible();
  const inputOnlyPreview = page.getByRole('img', {
    name: `Preview of ${HEIC_FIXTURES.heic.name}`,
  });
  await expect(inputOnlyPreview).toBeVisible();
  await expect
    .poll(() => inputOnlyPreview.evaluate((image) => (image as HTMLImageElement).naturalWidth))
    .toBeGreaterThan(0);

  await recipeDocumentInput.setInputFiles([
    {
      name: HEIC_FIXTURES.heic.name,
      mimeType: HEIC_FIXTURES.heic.mimeType,
      buffer: Buffer.from(HEIC_FIXTURES.heic.data, 'base64'),
    },
    {
      name: HEIC_FIXTURES.heif.name,
      mimeType: HEIC_FIXTURES.heif.mimeType,
      buffer: Buffer.from(HEIC_FIXTURES.heif.data, 'base64'),
    },
  ]);
  await expect(page.getByText('iPhone photos were prepared as JPEG on this device.')).toBeVisible();
  const selectedPreviews = page.locator('.import-selected-preview img');
  await expect(selectedPreviews).toHaveCount(2);
  await expect
    .poll(() =>
      selectedPreviews.first().evaluate((image) => (image as HTMLImageElement).naturalWidth),
    )
    .toBeGreaterThan(0);
  const createVisionReview = page.getByRole('button', {
    name: 'Send to OpenAI and create draft',
  });
  await expect(createVisionReview).toBeEnabled();
  const aiImproveImport = page.getByRole('checkbox', { name: /AI Improve/u });
  await expect(aiImproveImport).toBeVisible();
  await aiImproveImport.check();
  await createVisionReview.click();
  const readingOverlays = page.locator('.import-source-preview-frame .import-preview-overlay');
  await expect(readingOverlays).toHaveCount(2);
  await expect(readingOverlays.first()).toContainText('OpenAI is reading this image');
  await expect(page.getByText(/OpenAI is reading the normalized scan/)).toBeVisible();
  await expect(page.getByText('Review before saving')).toBeVisible();
  await expect
    .poll(() => visionRequest)
    .toMatchObject({
      confirm: true,
      kind: 'vision-extraction',
      importId: expect.any(String),
      improve: true,
    });
  await expect(page.getByText(/OpenAI read the normalized scans at your request/)).toBeVisible();
  const normalizedScans = page.getByRole('img', { name: /Normalized scan imported from/ });
  await expect(normalizedScans).toHaveCount(2);
  const normalizedScan = normalizedScans.first();
  await expect(normalizedScan).toBeVisible();
  await expect
    .poll(() => normalizedScan.evaluate((image) => (image as HTMLImageElement).naturalWidth))
    .toBeGreaterThan(0);
  await expect(page.locator('.import-source-preview-frame .import-preview-ready')).toHaveCount(2);
  await page.getByRole('button', { name: 'Confirm and add to cookbook' }).click();
  await expect(page.getByRole('heading', { name: 'Lemon pasta' })).toBeVisible();
  await page.unroute('**/api/v1/ai/reviews');

  await page.goto('/import');
  await page.route('**/api/v1/ai/reviews', async (route) => {
    await new Promise((resolve) => setTimeout(resolve, 250));
    await route.fulfill({
      status: 503,
      contentType: 'application/json',
      body: JSON.stringify({ error: { message: 'OpenAI could not read this test image.' } }),
    });
  });
  await page.getByLabel('Recipe document or scan').setInputFiles({
    name: HEIC_FIXTURES.heic.name,
    mimeType: HEIC_FIXTURES.heic.mimeType,
    buffer: Buffer.from(HEIC_FIXTURES.heic.data, 'base64'),
  });
  await expect(page.getByRole('button', { name: 'Send to OpenAI and create draft' })).toBeEnabled();
  await page.getByRole('button', { name: 'Send to OpenAI and create draft' }).click();
  await expect(
    page
      .getByRole('region', { name: 'Notifications' })
      .getByText('OpenAI could not read this test image.'),
  ).toBeVisible();
  await expect(
    page.locator('.import-source-preview-frame .import-preview-overlay.error'),
  ).toContainText('OpenAI could not read this test image.');
  await expect(page.getByRole('button', { name: 'Try OpenAI again' })).toBeVisible();
  await page.unroute('**/api/v1/ai/reviews');

  await page.setViewportSize({ width: 1280, height: 720 });
  await page.goto('/import');
  await page.getByRole('button', { name: /Paste Schema\.org JSON-LD/ }).click();
  await page.getByLabel('Schema.org JSON-LD').fill(
    JSON.stringify({
      '@context': 'https://schema.org',
      '@graph': [
        {
          '@type': 'Recipe',
          name: 'JSON-LD tomato toast',
          recipeYield: '2 servings',
          prepTime: 'PT5M',
          cookTime: 'PT10M',
          recipeIngredient: ['2 slices bread', '1 tomato'],
          recipeInstructions: ['Toast the bread.', 'Top with tomato.'],
        },
      ],
    }),
  );
  await page.getByRole('button', { name: 'Find Recipe candidates' }).click();
  await expect(page.getByRole('heading', { name: 'JSON-LD tomato toast' })).toBeVisible();
  await page.getByRole('button', { name: 'Review this Recipe' }).click();
  await expect(page.getByText('Portable recipe review')).toBeVisible();
  await page.getByRole('button', { name: 'Confirm and add to cookbook' }).click();
  await expect(page.getByRole('heading', { name: 'JSON-LD tomato toast' })).toBeVisible();
  await page.goto('/capture');
  await page.route('**/api/v1/capture-drafts', async (route) => {
    const body = route.request().postDataJSON() as { candidateIndex?: number };
    if (body.candidateIndex === undefined) {
      await route.fulfill({
        contentType: 'application/json',
        body: JSON.stringify({
          candidates: [
            {
              index: 0,
              title: 'Structured URL soup',
              summary: 'A deterministic page candidate.',
              source: 'schema-jsonld',
              warnings: [],
            },
          ],
        }),
      });
      return;
    }
    await route.fulfill({
      contentType: 'application/json',
      body: JSON.stringify({
        draft: {
          recipe: {
            title: 'Structured URL soup',
            summary: 'A deterministic page candidate.',
            servings: '4 servings',
            prepMinutes: 5,
            cookMinutes: 20,
            sourceName: 'recipes.example.test',
            sourceUrl: 'https://recipes.example.test/soup',
            tags: [],
            ingredientGroups: [
              { name: '', ingredients: [{ quantity: 1, unit: '', item: 'onion', note: '' }] },
            ],
            instructionSections: [{ title: '', steps: ['Simmer the soup.'] }],
          },
          provenance: {
            kind: 'url',
            sourceUrl: 'https://recipes.example.test/soup',
            sourceName: 'recipes.example.test',
            extractionMethod: 'url-jsonld',
            warnings: [],
            extractionNotice: 'Review every field before adding it to the shared cookbook.',
          },
          originalText: 'Structured URL soup',
        },
      }),
    });
  });
  await page.getByRole('tab', { name: 'From URL' }).click();
  await page.getByLabel('Public recipe URL').fill('https://recipes.example.test/soup');
  await page.getByRole('button', { name: 'Find and normalize with AI' }).click();
  await expect(page.getByRole('heading', { name: 'Structured URL soup' })).toBeVisible();
  await page.getByRole('button', { name: 'Review with AI' }).click();
  await expect(page.getByText('Review before saving')).toBeVisible();
  await page.getByRole('button', { name: 'Confirm and add to cookbook' }).click();
  await expect(page.getByRole('heading', { name: 'Structured URL soup' })).toBeVisible();
  await page.unroute('**/api/v1/capture-drafts');
  await page.goto('/capture');
  await page
    .getByLabel('Recipe text')
    .fill(
      'Weeknight tomato soup\nIngredients\n2 tbsp olive oil\ncrushed tomatoes\nMethod\n1. Simmer the tomatoes until glossy.',
    );
  await page.getByRole('button', { name: 'Normalize with OpenAI' }).click();
  await expect(page.getByText('Review before saving')).toBeVisible();
  await page.getByRole('button', { name: 'Confirm and add to cookbook' }).click();
  await expect(page.getByRole('heading', { name: 'Weeknight tomato soup' })).toBeVisible();
  const recipeUrl = page.url();
  const recipeId = new URL(recipeUrl).pathname.split('/').at(-1);
  if (!recipeId) throw new Error('Recipe confirmation did not navigate to a recipe card.');
  const jsonLdExport = await page.request.get(`/api/v1/recipes/${recipeId}/export`);
  expect(jsonLdExport.ok()).toBe(true);
  await expect(jsonLdExport.json()).resolves.toMatchObject({
    '@type': 'Recipe',
    name: 'Weeknight tomato soup',
  });
  const markdownExport = await page.request.get(`/api/v1/recipes/${recipeId}/export/markdown`);
  expect(markdownExport.ok()).toBe(true);
  await expect(markdownExport.text()).resolves.toContain('# Weeknight tomato soup');
  await page.goto('/recipes');
  const portableDownload = page.waitForEvent('download');
  await page.getByRole('link', { name: 'Download recipe archive' }).click();
  expect((await portableDownload).suggestedFilename()).toBe('our-recipes-portable-recipes.tar.gz');
  await page.goto('/collections');
  await expect(
    page.getByRole('heading', { name: 'A shelf for the recipes that belong together.' }),
  ).toBeVisible();
  await page.getByLabel('Collection name').fill('Weeknight keepers');
  await page.getByRole('button', { name: 'Create collection' }).click();
  await page.getByRole('link', { name: 'Open collection' }).click();
  await page.getByLabel('Recipe to add').selectOption({ label: 'Weeknight tomato soup' });
  await page.getByRole('button', { name: 'Add recipe' }).click();
  await expect(page.getByRole('link', { name: 'Weeknight tomato soup' })).toBeVisible();
  await page.getByLabel('Recipe to add').selectOption({ label: 'Lemon pasta' });
  await page.getByRole('button', { name: 'Add recipe' }).click();
  await page.getByRole('button', { name: 'Move Lemon pasta up' }).click();
  await expect(page.getByRole('link', { name: 'Lemon pasta' })).toBeVisible();
  await page.getByLabel('A small note (optional)').fill('A shelf for busy evenings.');
  await page.getByRole('button', { name: 'Save collection' }).click();
  await expect(page.getByText('A shelf for busy evenings.')).toBeVisible();
  await page.goto(recipeUrl);
  const tinyRecipePhoto = await sharp({
    create: { width: 2, height: 2, channels: 3, background: '#9f482f' },
  })
    .png()
    .toBuffer();
  await page.getByLabel('Add a recipe photo').setInputFiles({
    name: 'tomato-soup.png',
    mimeType: 'image/png',
    buffer: tinyRecipePhoto,
  });
  await page.getByLabel('Photo description (optional)').fill('Tomato soup in a cream bowl');
  await page.getByRole('button', { name: 'Upload photo' }).click();
  const uploadedPhoto = page.getByRole('img', { name: 'Tomato soup in a cream bowl' });
  await expect(uploadedPhoto).toBeVisible();
  await expect
    .poll(() => uploadedPhoto.evaluate((image) => (image as HTMLImageElement).naturalWidth))
    .toBe(2);
  await page.goto('/collections');
  await page.getByRole('link', { name: 'Open collection' }).click();
  await page.getByLabel('Cover photo').selectOption({ index: 1 });
  await page.getByRole('button', { name: 'Save collection' }).click();
  await expect(page.getByText('Current collection cover')).toBeVisible();
  await page.goto(recipeUrl);
  await page.getByRole('link', { name: 'Edit recipe' }).click();
  await page.getByLabel('Cook minutes').fill('30');
  await page.getByLabel('Original author (optional)').fill('Callum');
  await page.getByLabel('Cooking method (optional)').fill('oven-roasted');
  await page
    .getByLabel('Equipment (one item per line, optional)')
    .fill('Sheet pan\nImmersion blender');
  await page.getByLabel('Calories (kcal)').fill('230');
  await page.getByLabel('Protein (g)').fill('5');
  await page.getByRole('button', { name: 'Add ingredient section' }).click();
  await page.getByLabel('Section title (optional)').nth(1).fill('To serve');
  await page.getByLabel('Ingredient 2-1 item').fill('basil');
  await page.getByRole('button', { name: 'Add method section' }).click();
  await page.getByLabel('Section title (optional)').nth(3).fill('Finish');
  await page.getByLabel('Method section 2, step 1').fill('Ladle and serve with basil.');
  await page.getByRole('button', { name: 'Save a new revision' }).click();
  await expect(page.getByText('Revision 2')).toBeVisible();
  await expect(page.getByRole('heading', { name: 'To serve' })).toBeVisible();
  await expect(page.getByRole('heading', { name: 'Finish' })).toBeVisible();
  await expect(page.getByText('Oven-Roasted', { exact: true })).toBeVisible();
  await expect(page.getByText('Sheet pan', { exact: true })).toBeVisible();
  await expect(page.getByText('230 kcal', { exact: true })).toBeVisible();
  await page.getByLabel('Your rating').selectOption('5');
  await page.getByLabel('Personal note').fill('Use extra basil next time.');
  await page.getByRole('button', { name: 'Save personal preference' }).click();
  await expect(page.locator('.recipe-personal-preference [role="status"]')).toHaveText(
    'Saved for your profile.',
  );
  const recipeManagement = page.getByRole('region', { name: 'Recipe management' });
  await recipeManagement.getByText('Revision history', { exact: true }).click();
  await expect(recipeManagement.getByText('2 saved versions', { exact: true })).toBeVisible();
  await page.getByRole('button', { name: 'Restore revision 1' }).click();
  await expect(page.locator('.revision-restore-confirmation [role="status"]')).toContainText(
    'Restore revision 1?',
  );
  await page.getByRole('button', { name: 'Confirm restore' }).click();
  await expect(page.locator('.recipe-revision-badge')).toHaveText('Revision 3');
  await expect(page.getByText('Oven-Roasted', { exact: true })).not.toBeVisible();
  await page.getByRole('link', { name: 'Cook this recipe' }).click();
  await page.getByRole('button', { name: 'Save favorite' }).click();
  await page.getByRole('button', { name: 'Start cooking' }).click();
  await page.getByLabel('Timer minutes').fill('1');
  await page.getByRole('button', { name: 'Add', exact: true }).click();
  await expect(page.getByText('1:00')).toBeVisible();
  await page.getByRole('button', { name: 'Finish cooking' }).click();
  await page.getByRole('link', { name: '← Recipe card' }).click();
  await page.goto('/planner');
  const weekRange = await page.locator('.week-plan .eyebrow').textContent();
  const [weekStart, weekEnd] = weekRange?.split(' TO ').map((value) => value.trim()) ?? [];
  if (!weekStart || !weekEnd) throw new Error('Planner did not render a week range.');
  await page.getByLabel('Date').fill(weekStart);
  await page.locator('select[name="recipeId"]').selectOption({ label: 'Weeknight tomato soup' });
  await page.getByLabel('Servings').fill('4');
  await page.getByRole('button', { name: 'Add to plan' }).click();
  await expect(page.getByRole('heading', { name: 'Weeknight tomato soup' })).toBeVisible();
  await page.getByLabel('A free-form meal').check();
  await page.locator('select[name="meal"]').selectOption('snack');
  await page.locator('input[name="title"]').fill('Leftovers board');
  await page.getByRole('button', { name: 'Add to plan' }).click();
  await expect(page.getByRole('heading', { name: 'Leftovers board' })).toBeVisible();
  const calendarResponse = await page.request.get(
    `/api/v1/meal-plan/export?start=${weekStart}&end=${weekEnd}`,
  );
  expect(calendarResponse.ok()).toBe(true);
  await expect(calendarResponse.text()).resolves.toContain('BEGIN:VCALENDAR');
  await page.getByRole('button', { name: 'Copy to next week' }).click();
  await expect(page).toHaveURL(/\/planner\?week=/);
  await expect(page.getByRole('heading', { name: 'Leftovers board' })).toBeVisible();
  await page.goto(`/planner?week=${weekStart}`);
  await page.getByRole('button', { name: 'Generate an editable shopping list' }).click();
  await expect(page.getByRole('heading', { name: /^Week of \d{4}-\d{2}-\d{2}$/u })).toBeVisible();
  await page.getByLabel('New shopping item').fill('lemons');
  await page.getByRole('button', { name: 'Add item' }).click();
  await expect(page.locator('input[value="lemons"]')).toBeVisible();
  await page.getByLabel('New shopping aisle').fill('Produce');
  await page.getByRole('button', { name: 'Add aisle' }).click();
  await page.getByLabel('Aisle for lemons').selectOption({ label: 'Produce' });
  await expect(
    page.getByRole('region', { name: 'Produce' }).locator('input[value="lemons"]'),
  ).toBeVisible();

  const manifestResponse = await page.request.get('/manifest.webmanifest');
  expect(manifestResponse.ok()).toBe(true);
  await expect(manifestResponse.json()).resolves.toMatchObject({
    name: 'Our Recipes',
    display: 'standalone',
  });
  const workerResponse = await page.request.get('/sw.js');
  expect(workerResponse.ok()).toBe(true);
  expect(workerResponse.headers()['cache-control']).toBe('no-cache, no-store, must-revalidate');
  expect(workerResponse.headers()['service-worker-allowed']).toBe('/');
  await expect(workerResponse.text()).resolves.toContain("const APP_VERSION = '0.1.0-beta.10';");
  await page.goto(recipeUrl);
  await page.waitForFunction(async () => {
    if (!('serviceWorker' in navigator)) return false;
    await navigator.serviceWorker.ready;
    return Boolean(navigator.serviceWorker.controller);
  });
  await page.reload();
  await expect(page.getByRole('heading', { name: 'Weeknight tomato soup' })).toBeVisible();
  await page.context().setOffline(true);
  try {
    await page.reload({ waitUntil: 'domcontentloaded' });
    await expect(page.getByRole('heading', { name: 'Weeknight tomato soup' })).toBeVisible();
    await expect(page.getByRole('img', { name: 'Tomato soup in a cream bowl' })).toBeVisible();
  } finally {
    await page.context().setOffline(false);
  }
  await page.goto('/settings/backups');
  await page.getByRole('button', { name: 'Create backup' }).click();
  await expect(page.getByRole('button', { name: 'Validate & restore' })).toBeVisible();
  await page.getByRole('button', { name: 'Validate & restore' }).click();
  await expect(
    page.getByRole('heading', { name: 'Ready to restore, if you mean it.' }),
  ).toBeVisible();
});
