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

test('a candidate handoff opens the real recipe server page without changing its saved photo', async ({
  page,
}, testInfo) => {
  test.setTimeout(120000);
  await signInWorkflowFixture(page);
  const title = `Candidate handoff fixture ${Date.now()}`;
  const created = await page.request.post('/api/v1/recipes', {
    headers: { Origin: 'http://127.0.0.1:3100' },
    data: {
      ...emptyRecipeInput,
      title,
      servings: '2',
      ingredientGroups: [
        { name: '', ingredients: [{ quantity: '500', unit: 'g', item: 'tomatoes', note: '' }] },
      ],
      instructionSections: [{ title: '', steps: ['Simmer, then blend.'] }],
    },
  });
  expect(created.ok()).toBe(true);
  const { recipe } = await created.json();
  const bytes = await sharp({
    create: { width: 160, height: 120, channels: 3, background: '#8e5541' },
  })
    .webp()
    .toBuffer();
  const uploaded = await page.request.post(`/api/v1/recipes/${recipe.id}/images`, {
    headers: { Origin: 'http://127.0.0.1:3100' },
    multipart: {
      image: { name: 'saved.webp', mimeType: 'image/webp', buffer: bytes },
      altText: 'Saved photo remains selected',
    },
  });
  expect(uploaded.ok()).toBe(true);
  const candidateId = '00000000-0000-4000-8000-000000000897';
  let generated = 0;
  let reads = 0;
  await page.route(`**/api/v1/recipes/${recipe.id}/images/generate`, (route) => {
    generated++;
    return route.abort();
  });
  await page.route(`**/api/v1/recipes/${recipe.id}/image-candidates/${candidateId}`, (route) => {
    expect(route.request().method()).toBe('GET');
    reads++;
    return route.fulfill({
      json: {
        candidate: {
          id: candidateId,
          recipeId: recipe.id,
          sourceRevision: 1,
          status: 'ready',
          altText: 'Private candidate handoff',
          width: 160,
          height: 120,
          model: 'gpt-image-2',
          quality: 'low',
          size: '1024x1024',
          promptVersion: 'synthetic',
          imageId: null,
          createdAt: new Date().toISOString(),
        },
      },
    });
  });
  await page.route(`**/api/v1/recipes/${recipe.id}/image-candidates/${candidateId}/file`, (route) =>
    route.fulfill({ contentType: 'image/webp', body: bytes }),
  );
  await page.goto(`/recipes/${recipe.id}?imageCandidate=${candidateId}#recipe-photos`);
  await expect(page).toHaveTitle(new RegExp(title));
  await expect(page.getByRole('heading', { level: 1, name: title })).toBeVisible();
  await expect(page.getByRole('heading', { name: 'Recipe management' })).toBeAttached();
  await expect(page.getByRole('img', { name: 'Saved photo remains selected' })).toBeVisible();
  const check = page.getByRole('button', { name: 'Check this request' });
  await expect(check).toBeVisible();
  expect(generated).toBe(0);
  expect(reads).toBe(0);
  await check.click();
  await expect(page.getByRole('img', { name: 'Private candidate handoff' })).toBeVisible();
  await expect(page.getByRole('button', { name: 'Add reviewed photo' })).toBeEnabled();
  await expect(page.getByRole('img', { name: 'Saved photo remains selected' })).toBeVisible();
  expect(reads).toBe(1);
  expect(generated).toBe(0);
  await page.screenshot({
    path: testInfo.outputPath('real-recipe-page-candidate-handoff.png'),
    fullPage: true,
  });
});
