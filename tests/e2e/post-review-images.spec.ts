import { expect, test } from '@playwright/test';
import sharp from 'sharp';
import { mkdirSync, writeFileSync } from 'node:fs';
import { execFileSync } from 'node:child_process';
import { emptyRecipeInput } from '../../src/lib/domain/recipe';
import { signInWorkflowFixture } from './helpers/onboarding';
import { appAxe } from './helpers/accessibility';
test('draft images need their own explicit request and stay separate from recipe acceptance', async ({
  page,
}) => {
  test.setTimeout(180000);
  await signInWorkflowFixture(page);
  const threadId = '00000000-0000-4000-8000-000000000891';
  const actionId = '00000000-0000-4000-8000-000000000892';
  const candidateId = '00000000-0000-4000-8000-000000000893';
  const recipeId = '00000000-0000-4000-8000-000000000894';
  const recipe = {
    ...emptyRecipeInput,
    title: 'Synthetic tomato soup',
    servings: '4',
    ingredientGroups: [
      { name: 'Soup', ingredients: [{ quantity: 500, unit: 'g', item: 'tomatoes', note: '' }] },
    ],
    instructionSections: [{ title: 'Cook', steps: ['Simmer, then blend.'] }],
  };
  let action = {
    id: actionId,
    kind: 'recipe_create',
    status: 'pending',
    sourceDigest: 'a'.repeat(64),
    preview: { recipe, image: { status: 'not_requested' } },
    result: undefined as unknown,
  };
  let imageCalls = 0;
  let release!: () => void;
  const gate = new Promise<void>((r) => {
    release = r;
  });
  const bytes = await sharp({
    create: { width: 300, height: 200, channels: 3, background: '#9a5434' },
  })
    .webp()
    .toBuffer();
  await page.route('**/api/v1/ai/chat/threads', (route) =>
    route.fulfill({ json: { threads: [{ id: threadId, title: 'Synthetic image review' }] } }),
  );
  await page.route(`**/api/v1/ai/chat/threads/${threadId}`, (route) =>
    route.fulfill({ json: { messages: [], actions: [action], jobs: [], turns: [] } }),
  );
  await page.route('**/api/v1/ai/app-actions?*', (route) =>
    route.fulfill({ json: { proposals: [] } }),
  );
  await page.route(`**/api/v1/ai/actions/${actionId}/image`, async (route) => {
    if (route.request().method() === 'GET')
      return route.fulfill({ contentType: 'image/webp', body: bytes });
    imageCalls++;
    expect(route.request().postDataJSON()).toMatchObject({
      confirm: true,
      expectedSourceDigest: action.sourceDigest,
      operationId: expect.any(String),
    });
    await gate;
    action = {
      ...action,
      preview: {
        recipe,
        image: { status: 'ready', altText: 'Synthetic private soup preview' } as { status: string },
      },
    };
    await route.fulfill({ json: { action } });
  });
  await page.route(`**/api/v1/ai/actions/${actionId}`, async (route) => {
    expect(route.request().method()).toBe('PATCH');
    expect(route.request().postDataJSON().decision).toBe('confirm');
    action = { ...action, status: 'confirmed', result: { recipeId, candidateId } };
    await route.fulfill({ json: { action } });
  });
  await page.route(`**/api/v1/recipes/${recipeId}/image-candidates/${candidateId}/file`, (route) =>
    route.fulfill({ contentType: 'image/webp', body: bytes }),
  );
  await page.goto('/');
  await page.getByRole('button', { name: 'Open AI assistant' }).click();
  const dialog = page.getByRole('dialog', { name: 'Kitchen assistant' });
  const card = dialog.getByRole('article', { name: 'Recipe proposal: Synthetic tomato soup' });
  const button = card.getByRole('button', { name: 'Generate an image preview (paid)' });
  await button.scrollIntoViewIfNeeded();
  await expect(button).toBeVisible();
  expect(imageCalls).toBe(0);
  const dir = 'screenshots/post-review/images';
  mkdirSync(dir, { recursive: true });
  await page.screenshot({ path: `${dir}/draft-before-request-1440.png` });
  await button.click();
  await expect(card.getByRole('button', { name: 'Preparing image…' })).toBeDisabled();
  await expect(card.getByRole('button', { name: 'Add to My Recipes' })).toBeDisabled();
  await page.setViewportSize({ width: 390, height: 844 });
  await card.getByRole('button', { name: 'Preparing image…' }).scrollIntoViewIfNeeded();
  await page.screenshot({ path: `${dir}/draft-pending-390.png` });
  release();
  await expect(card.getByRole('img', { name: 'Synthetic private soup preview' })).toBeVisible();
  for (const [width, height] of [
    [1440, 1000],
    [390, 844],
    [320, 568],
  ]) {
    await page.setViewportSize({ width, height });
    const save = card.getByRole('button', { name: 'Add to My Recipes' });
    await save.scrollIntoViewIfNeeded();
    await save.focus();
    await expect(save).toBeFocused();
    await expect(save).toBeInViewport();
    expect(await save.evaluate((el) => el.scrollWidth <= el.clientWidth + 1)).toBe(true);
    await page.screenshot({ path: `${dir}/draft-ready-${width}.png` });
  }
  expect((await appAxe(page).include('[role="dialog"]').analyze()).violations).toEqual([]);
  await card.getByRole('button', { name: 'Add to My Recipes' }).click();
  await expect(card.getByRole('link', { name: 'Review image before selecting' })).toHaveAttribute(
    'href',
    `/recipes/${recipeId}?imageCandidate=${candidateId}#recipe-photos`,
  );
  expect(imageCalls).toBe(1);
  await page.screenshot({ path: `${dir}/saved-private-candidate-320.png` });
  writeFileSync(
    `${dir}/evidence.json`,
    JSON.stringify(
      {
        baseRevision: execFileSync('git', ['rev-parse', 'HEAD'], { encoding: 'utf8' }).trim(),
        workingTree: 'post-review implementation',
        fixtures: 'intercepted owned action and synthetic WebP; no live provider request',
        states: [
          'text draft no automatic image',
          'explicit paid request pending',
          'private preview ready',
          'saved recipe links to separate candidate acceptance',
        ],
        viewports: [
          [1440, 1000],
          [390, 844],
          [320, 568],
        ],
        axeViolations: 0,
        imageRequests: imageCalls,
      },
      null,
      2,
    ) + '\n',
  );
});
