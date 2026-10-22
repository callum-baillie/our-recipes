import { test, expect } from '@playwright/test';
import { mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import { emptyRecipeInput } from '../../src/lib/domain/recipe';
import { signInWorkflowFixture } from './helpers/onboarding';
import { appAxe } from './helpers/accessibility';

test('session-only adaptation and dated restrictions survive reopening with honest saved scope', async ({
  page,
}) => {
  test.setTimeout(120000);
  await signInWorkflowFixture(page);
  const errors: string[] = [];
  page.on('pageerror', (error) => errors.push(error.message));
  const response = await page.request.post('/api/v1/recipes', {
    headers: { Origin: 'http://127.0.0.1:3100' },
    data: {
      ...emptyRecipeInput,
      title: 'Kitchen session fixture potatoes',
      servings: '2',
      cookingMethod: 'Air fry',
      equipment: ['Air fryer'],
      prepMinutes: 5,
      cookMinutes: 20,
      ingredientGroups: [
        { name: '', ingredients: [{ item: 'Potatoes', quantity: 500, unit: 'g', note: '' }] },
      ],
      instructionSections: [{ title: '', steps: ['Air fry the potatoes.'] }],
    },
  });
  expect(response.status()).toBe(201);
  const recipe = (await response.json()).recipe;
  await page.goto(`/recipes/${recipe.id}/cook`);
  await expect(page).toHaveTitle(/Cook Kitchen session fixture potatoes/);
  await expect(page.getByRole('heading', { name: recipe.title, exact: true })).toBeVisible();
  await page.getByRole('button', { name: 'Start cooking', exact: true }).click();
  await expect(page).toHaveURL(/sessionId=/);
  const url = page.url();
  await page.getByRole('button', { name: 'Adapt this session', exact: true }).click();
  await page.getByLabel('Cooking method', { exact: true }).fill('Stovetop');
  await page
    .getByRole('textbox', { name: 'Equipment (one item per line)', exact: true })
    .fill('Saucepan\nHob');
  await page.getByLabel('Cooking minutes', { exact: true }).fill('25');
  await page
    .getByRole('textbox', { name: 'Step 1', exact: true })
    .fill('Cut into even pieces. Simmer in water until tender, then drain.');
  await page.getByRole('button', { name: 'Review session change', exact: true }).click();
  await expect(
    page.getByText('Save Stovetop with 30 estimated minutes', { exact: false }),
  ).toBeVisible();
  await page.getByRole('button', { name: 'Save this session only', exact: true }).click();
  await expect(page.getByRole('button', { name: 'Adapt this session', exact: true })).toBeVisible();
  const sessionId = new URL(page.url()).searchParams.get('sessionId')!;
  const exported = await page.request.get(
    `/api/v1/recipes/${recipe.id}/export?sessionId=${sessionId}`,
  );
  expect(exported.ok()).toBe(true);
  const document = await exported.json();
  expect(document.cookingMethod).toBe('Stovetop');
  expect(document.cookTime).toBe('PT25M');
  expect(JSON.stringify(document)).not.toContain(sessionId);
  const markdown = await page.request.get(
    `/api/v1/recipes/${recipe.id}/export/markdown?sessionId=${sessionId}`,
  );
  expect(markdown.ok()).toBe(true);
  expect(await markdown.text()).toContain('Simmer in water until tender');
  await page.reload();
  await page.getByRole('button', { name: 'Adapt this session', exact: true }).click();
  await expect(page.getByLabel('Cooking method', { exact: true })).toHaveValue('Stovetop');
  await expect(
    page.getByRole('textbox', { name: 'Equipment (one item per line)', exact: true }),
  ).toHaveValue('Saucepan\nHob');
  await expect(page.getByRole('textbox', { name: 'Step 1', exact: true })).toHaveValue(/Simmer/);
  await page.getByRole('button', { name: 'Close', exact: true }).click();
  await page.getByRole('button', { name: 'Review temporary equipment restrictions' }).click();
  await page.getByLabel('Date', { exact: true }).fill('2026-10-21');
  await page.getByLabel('Timezone', { exact: true }).fill('America/Chicago');
  await page.getByRole('button', { name: 'Save dated restriction', exact: true }).click();
  await expect(
    page.getByText(/on 2026-10-21 in America\/Chicago, for this session only/),
  ).toBeVisible();
  await page.reload();
  await expect(
    page.getByText(/on 2026-10-21 in America\/Chicago, for this session only/),
  ).toBeVisible();
  const stored = (await (await page.request.get(`/api/v1/recipes/${recipe.id}`)).json()).recipe;
  expect(stored.cookingMethod).toBe('Air fry');
  const dir = 'screenshots/my-kitchen/cooking';
  mkdirSync(dir, { recursive: true });
  for (const [name, width, height, zoom] of [
    ['desktop', 1440, 1000, 1],
    ['mobile', 390, 844, 1],
    ['reflow-320', 320, 844, 1],
    ['short', 390, 560, 1],
    ['enlarged', 850, 1000, 2],
  ] as const) {
    await page.setViewportSize({ width, height });
    await page.evaluate((z) => {
      document.documentElement.style.fontSize = `${z * 100}%`;
    }, zoom);
    const section = page.getByRole('region', { name: 'This cooking episode', exact: true });
    await section.evaluate((element) => element.scrollIntoView({ block: 'center' }));
    expect(
      await page.evaluate(() => document.documentElement.scrollWidth > window.innerWidth),
    ).toBe(false);
    await page.screenshot({ path: `${dir}/${name}.png`, fullPage: false });
  }
  expect((await appAxe(page).analyze()).violations).toEqual([]);
  expect(errors).toEqual([]);
  await page.goto(url);
  await page.getByRole('button', { name: 'Adapt this session', exact: true }).click();
  await page.getByRole('button', { name: 'Undo latest session change', exact: true }).click();
  await expect(page.getByRole('button', { name: 'Adapt this session', exact: true })).toBeVisible();
  await page.getByRole('button', { name: 'Adapt this session', exact: true }).click();
  await expect(page.getByLabel('Cooking method', { exact: true })).toHaveValue('Air fry');
  writeFileSync(
    `${dir}/manifest.json`,
    JSON.stringify(
      {
        testedState: 'Uncommitted My Kitchen session/episode implementation',
        baseRevision: JSON.parse(readFileSync('docs/my-kitchen/source-manifest.json', 'utf8'))
          .baseRevision,
        sourceDigest: JSON.parse(readFileSync('docs/my-kitchen/source-manifest.json', 'utf8'))
          .sourceDigest,
        buildId: readFileSync('.next/BUILD_ID', 'utf8').trim(),
        capturedAt: new Date().toISOString(),
        browser: 'Chromium',
        provider: 'No provider calls',
        states: ['1440x1000', '390x844', '320x844', '390x560', '850x1000 at 200% root font'],
      },
      null,
      2,
    ) + '\n',
  );
});
