import { expect, test } from '@playwright/test';
import sharp from 'sharp';
import { emptyRecipeInput } from '../../src/lib/domain/recipe';
import { signInWorkflowFixture } from './helpers/onboarding';
import { appAxe } from './helpers/accessibility';

test('generated image preview preserves saved photos and recovers a stale acceptance', async ({
  page,
}, testInfo) => {
  test.setTimeout(120000);
  await signInWorkflowFixture(page);
  const input = {
    ...emptyRecipeInput,
    title: `Image review fixture ${Date.now()}`,
    servings: '4',
    ingredientGroups: [
      {
        name: '',
        ingredients: [
          {
            quantity: '500',
            unit: 'g',
            item: 'tomatoes',
            note: 'chopped',
            shoppingCategory: 'Fresh produce',
          },
        ],
      },
    ],
    instructionSections: [{ title: '', steps: ['Simmer, then blend.'] }],
  };
  const created = await page.request.post('/api/v1/recipes', {
    headers: { Origin: 'http://127.0.0.1:3100' },
    data: input,
  });
  expect(created.ok()).toBe(true);
  const { recipe } = await created.json();
  const bytes = await sharp({
    create: { width: 320, height: 240, channels: 3, background: '#ba7754' },
  })
    .webp()
    .toBuffer();
  const upload = await page.request.post(`/api/v1/recipes/${recipe.id}/images`, {
    headers: { Origin: 'http://127.0.0.1:3100' },
    multipart: {
      image: { name: 'existing.webp', mimeType: 'image/webp', buffer: bytes },
      altText: 'Existing synthetic recipe photo',
    },
  });
  expect(upload.ok()).toBe(true);
  let resolveGeneration!: () => void;
  const gate = new Promise<void>((resolve) => {
    resolveGeneration = resolve;
  });
  let generationCalls = 0;
  let candidate: Record<string, unknown> = {};
  await page.route(`**/api/v1/recipes/${recipe.id}/images/generate`, async (route) => {
    generationCalls++;
    const request = route.request().postDataJSON();
    expect(request).toMatchObject({ confirm: true, preview: true, expectedRevision: 1 });
    candidate = {
      id: request.operationId,
      recipeId: recipe.id,
      sourceRevision: 1,
      status: 'ready',
      altText: 'AI-generated synthetic preview',
      width: 320,
      height: 240,
      model: 'gpt-image-2',
      quality: 'low',
      size: '1024x1024',
      promptVersion: 'fixture',
      imageId: null,
      createdAt: new Date().toISOString(),
    };
    await gate;
    await route.fulfill({ json: { candidate } });
  });
  await page.route(`**/api/v1/recipes/${recipe.id}/image-candidates/*/file`, (route) =>
    route.fulfill({ contentType: 'image/webp', body: bytes }),
  );
  await page.route(
    new RegExp(`/api/v1/recipes/${recipe.id}/image-candidates/[^/]+$`),
    async (route) => {
      if (route.request().method() === 'POST')
        await route.fulfill({
          status: 409,
          json: {
            error: {
              message:
                'The recipe changed after generation. Review a new image for the current version.',
            },
          },
        });
      else if (route.request().method() === 'DELETE')
        await route.fulfill({ json: { candidate: { ...candidate, status: 'discarded' } } });
      else await route.fulfill({ json: { candidate } });
    },
  );
  await page.goto(`/recipes/${recipe.id}`);
  await page.getByRole('button', { name: 'Manage photos' }).click();
  await page.getByRole('button', { name: 'Generate preview with OpenAI' }).click();
  await expect(
    page.getByText('Preparing a preview. The existing photos remain unchanged.'),
  ).toBeVisible();
  await expect(page.getByRole('img', { name: 'Existing synthetic recipe photo' })).toBeVisible();
  await page.setViewportSize({ width: 390, height: 844 });
  await page.getByRole('button', { name: 'Stop waiting' }).scrollIntoViewIfNeeded();
  await page.screenshot({ path: testInfo.outputPath('image-preview-pending-390.png') });
  resolveGeneration();
  await expect(page.getByRole('button', { name: 'Add reviewed photo' })).toBeVisible();
  for (const viewport of [
    { width: 1440, height: 1000 },
    { width: 390, height: 844 },
    { width: 320, height: 568 },
  ]) {
    await page.setViewportSize(viewport);
    await page.getByRole('button', { name: 'Add reviewed photo' }).focus();
    await expect(page.getByRole('button', { name: 'Add reviewed photo' })).toBeInViewport();
    expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(
      true,
    );
    await page.screenshot({
      path: testInfo.outputPath(`image-preview-ready-${viewport.width}.png`),
    });
  }
  expect(
    (await appAxe(page).include('section[aria-labelledby="image-generation-heading"]').analyze())
      .violations,
  ).toEqual([]);
  await page.getByRole('button', { name: 'Add reviewed photo' }).click();
  await expect(
    page.getByRole('alert').filter({ hasText: 'recipe changed after generation' }),
  ).toBeVisible();
  await expect(page.getByRole('img', { name: 'Existing synthetic recipe photo' })).toHaveCount(1);
  await expect(page.getByRole('img', { name: 'AI-generated synthetic preview' })).toHaveCount(1);
  await page.screenshot({
    path: testInfo.outputPath('image-preview-stale-acceptance.png'),
    fullPage: true,
  });
  expect(generationCalls).toBe(1);
  await page.getByRole('button', { name: 'Discard this preview' }).click();
  await expect(page.getByRole('button', { name: 'Generate another paid preview' })).toBeEnabled();
  expect(generationCalls).toBe(1);
});
