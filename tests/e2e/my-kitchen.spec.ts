import { appAxe } from './helpers/accessibility';
import { expect, test } from '@playwright/test';
import { mkdirSync, writeFileSync, readFileSync } from 'node:fs';
import { execFileSync } from 'node:child_process';
import { signInWorkflowFixture } from './helpers/onboarding';
const dir = 'screenshots/my-kitchen';
test('household inventory adds duplicates, edits one, resumes a draft and reflows', async ({
  page,
}) => {
  test.setTimeout(120000);
  mkdirSync(dir, { recursive: true });
  await signInWorkflowFixture(page);
  // Remove only prior records made by this synthetic, authenticated browser fixture.
  let current = (await (await page.request.get('/api/v1/kitchen')).json()).kitchen;
  for (const saved of current.items.filter(
    (i: { name: string; availability: string }) =>
      ['Countertop cooker', 'Old cooker'].includes(i.name) && i.availability !== 'archived',
  )) {
    const item = Object.fromEntries(
      Object.entries(saved).filter(
        ([key]) => !['id', 'revision', 'createdAt', 'updatedAt', 'actorProfileId'].includes(key),
      ),
    );
    const response = await page.request.post('/api/v1/kitchen', {
      headers: { Origin: 'http://127.0.0.1:3100' },
      data: {
        kind: 'update',
        operationId: crypto.randomUUID(),
        expectedRevision: current.revision,
        itemId: saved.id,
        expectedItemRevision: saved.revision,
        item: { ...item, availability: 'archived' },
      },
    });
    expect(response.ok()).toBe(true);
    current = (await response.json()).kitchen;
  }
  const errors: string[] = [];
  page.on('pageerror', (e) => errors.push(e.message));
  await page.goto('/my-kitchen');
  await expect(page.getByRole('heading', { name: 'My Kitchen', exact: true })).toBeVisible();
  await expect(page.getByText('Shared with your household', { exact: true })).toBeVisible();
  await page.getByRole('button', { name: 'Add equipment', exact: true }).click();
  await page
    .getByRole('combobox', { name: 'Equipment type', exact: true })
    .selectOption('pressure-air-multicooker');
  await page.getByLabel('Nickname', { exact: true }).fill('Countertop cooker');
  await page.getByLabel('Number of separate physical items').fill('2');
  await page.getByRole('button', { name: 'Review and save equipment', exact: true }).click();
  await expect(
    page.getByRole('button', { name: 'Edit Countertop cooker', exact: true }),
  ).toHaveCount(2);
  await page.getByRole('button', { name: 'Edit Countertop cooker', exact: true }).first().click();
  await page.getByLabel('Nickname', { exact: true }).fill('Old cooker');
  await page.getByRole('button', { name: 'Review and save change', exact: true }).click();
  await expect(page.getByRole('button', { name: 'Edit Old cooker', exact: true })).toBeVisible();
  await expect(
    page.getByRole('button', { name: 'Edit Countertop cooker', exact: true }),
  ).toHaveCount(1);
  await page.getByRole('button', { name: 'Add equipment', exact: true }).click();
  await page.getByLabel('Nickname', { exact: true }).fill('Unsaved saucepan');
  await page.reload();
  await expect(page.getByLabel('Nickname', { exact: true })).toHaveValue('Unsaved saucepan');
  await page.getByRole('button', { name: 'Discard draft', exact: true }).click();
  await expect(page.getByRole('status').filter({ hasText: 'Draft discarded' })).toContainText(
    'Draft discarded. Saved inventory unchanged.',
  );
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
    await page.evaluate(() => window.scrollTo(0, 0));
    await page.screenshot({ path: `${dir}/${name}.png`, fullPage: false });
    expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(
      true,
    );
  }
  await page.evaluate(() => {
    document.documentElement.style.fontSize = '100%';
  });
  await page.setViewportSize({ width: 320, height: 560 });
  await page.getByRole('button', { name: 'Add equipment', exact: true }).click();
  await page.getByLabel('Nickname', { exact: true }).fill('');
  await page.getByRole('button', { name: 'Review and save equipment', exact: true }).click();
  await expect(page.getByLabel(/^Nickname/)).toHaveAttribute('aria-invalid', 'true');
  await expect(page.getByText('Enter an equipment name.', { exact: true })).toBeVisible();
  await page.getByLabel(/^Nickname/).scrollIntoViewIfNeeded();
  await page.screenshot({ path: `${dir}/editor-error-320-short.png`, fullPage: false });
  expect((await appAxe(page).analyze()).violations).toEqual([]);
  await page.getByRole('button', { name: 'Discard draft', exact: true }).click();
  expect(errors).toEqual([]);
  writeFileSync(
    `${dir}/manifest.json`,
    JSON.stringify(
      {
        baseRevision: execFileSync('git', ['rev-parse', 'HEAD'], { encoding: 'utf8' }).trim(),
        testedState: 'v1.0.0-rc.21 integrated release candidate',
        buildId: readFileSync('.next/BUILD_ID', 'utf8').trim(),
        sourceDigest: JSON.parse(readFileSync('docs/refinement/rc21-source-manifest.json', 'utf8'))
          .sourceDigest,
        capturedAt: new Date().toISOString(),
        provider: 'No provider calls',
        browser: 'Chromium',
        states: ['1440x1000', '390x844', '320x844', '390x560', '850x1000 at 200% root font'],
      },
      null,
      2,
    ) + '\n',
  );
});
