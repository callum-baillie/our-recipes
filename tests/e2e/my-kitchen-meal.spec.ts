import { expect, test } from '@playwright/test';
import { signInWorkflowFixture } from './helpers/onboarding';
import { appAxe } from './helpers/accessibility';
import { mkdirSync, readFileSync, writeFileSync } from 'node:fs';

test('a complete dinner conflicts on one cooker, sequences, then uses two physical cookers and recovers active phases', async ({
  page,
}) => {
  test.setTimeout(180000);
  await signInWorkflowFixture(page);
  const origin = 'http://127.0.0.1:3100';
  const kitchen = async () => (await (await page.request.get('/api/v1/kitchen')).json()).kitchen;
  const command = async (body: Record<string, unknown>) => {
    const current = await kitchen();
    const response = await page.request.post('/api/v1/kitchen', {
      headers: { Origin: origin },
      data: { ...body, operationId: crypto.randomUUID(), expectedRevision: current.revision },
    });
    expect(response.ok()).toBe(true);
    return (await response.json()).kitchen;
  };
  const itemInput = (item: Record<string, unknown>) =>
    Object.fromEntries(
      Object.entries(item).filter(
        ([key]) => !['id', 'revision', 'createdAt', 'updatedAt', 'actorProfileId'].includes(key),
      ),
    );
  const before = await kitchen();
  const changed: string[] = [],
    created: string[] = [];
  let sessionId = '';
  try {
    for (const item of before.items.filter(
      (item: { availability: string; parentId: string | null; capabilities: string[] }) =>
        item.availability === 'available' &&
        !item.parentId &&
        item.capabilities.some((capability) => ['pressure-cook', 'air-fry'].includes(capability)),
    )) {
      await command({
        kind: 'update',
        itemId: item.id,
        expectedItemRevision: item.revision,
        item: { ...itemInput(item), availability: 'unavailable' },
      });
      changed.push(item.id);
    }
    const suffix = Date.now();
    let saved = await command({
      kind: 'add',
      item: { typeKey: 'pressure-air-multicooker', name: `Dinner cooker A ${suffix}` },
    });
    created.push(saved.items.at(-1).id);
    await command({ kind: 'coverage', coverage: 'confirmed' });
    const recipe = async (title: string, capability: string) => {
      const response = await page.request.post('/api/v1/recipes', {
        headers: { Origin: origin },
        data: {
          title,
          summary: '',
          servings: '2',
          prepMinutes: 5,
          cookMinutes: 20,
          sourceName: 'Synthetic meal fixture',
          sourceUrl: '',
          tags: [],
          equipmentRequirements: [
            {
              capability,
              quantity: 1,
              capacityReviewRequired: false,
              steps: [{ section: 0, step: 0 }],
            },
          ],
          ingredientGroups: [
            { name: '', ingredients: [{ item: 'Potatoes', quantity: 500, unit: 'g', note: '' }] },
          ],
          instructionSections: [
            {
              title: '',
              steps: [`Use the confirmed ${capability} mode. Follow the reviewed recipe.`],
            },
          ],
        },
      });
      expect(response.status()).toBe(201);
      return (await response.json()).recipe;
    };
    const stock = await recipe(`Dinner fixture stock ${suffix}`, 'pressure-cook'),
      potatoes = await recipe(`Dinner fixture potatoes ${suffix}`, 'air-fry');
    const started = await page.request.post('/api/v1/cook-sessions', {
      headers: { Origin: origin },
      data: { recipeId: stock.id, targetServings: 2 },
    });
    expect(started.status()).toBe(201);
    sessionId = (await started.json()).session.id;
    await page.goto(`/my-kitchen/plan?sessionId=${sessionId}`);
    await page.getByRole('button', { name: `Add main recipe: ${stock.title}` }).click();
    await page.getByLabel('Find a dinner component').fill(potatoes.title);
    await page.getByRole('button', { name: 'Search recipes', exact: true }).click();
    await page.getByRole('button', { name: `Add component: ${potatoes.title}` }).click();
    await page
      .getByLabel('Additional release, holding, transfer and cleaning (minutes)', { exact: true })
      .first()
      .fill('10');
    await page.getByRole('button', { name: 'Check the complete meal' }).click();
    await expect(
      page.getByRole('heading', { name: 'Equipment conflict', exact: true }),
    ).toBeVisible();
    await page.getByLabel('Resource order').selectOption('sequence');
    await page.getByRole('button', { name: 'Check the complete meal' }).click();
    await expect(
      page.getByRole('heading', { name: 'Compatible under the reviewed constraints' }),
    ).toBeVisible();
    const review = page.getByRole('region', { name: 'Complete meal equipment review' });
    await expect(review).toContainText('relative minutes 35–60');
    saved = await command({
      kind: 'add',
      item: { typeKey: 'pressure-air-multicooker', name: `Dinner cooker B ${suffix}` },
    });
    created.push(saved.items.at(-1).id);
    await page.getByLabel('Resource order').selectOption('parallel');
    await page.getByRole('button', { name: 'Check the complete meal' }).click();
    await expect(
      page.getByRole('heading', { name: 'Compatible under the reviewed constraints' }),
    ).toBeVisible();
    await page.getByRole('button', { name: 'Accept this complete meal plan' }).click();
    await expect(page.getByRole('status')).toContainText('Meal equipment plan saved');
    expect(
      (await (await page.request.get('/api/v1/kitchen/claims')).json()).claims.filter(
        (claim: { episodeId: string }) => claim.episodeId === sessionId,
      ),
    ).toHaveLength(0);
    await page.getByRole('button', { name: 'Start this phase', exact: true }).first().click();
    await expect(page.getByRole('button', { name: 'Start this phase', exact: true })).toHaveCount(
      1,
    );
    await page.getByRole('button', { name: 'Start this phase', exact: true }).click();
    await expect(
      page.getByRole('button', { name: 'Confirm equipment is physically free', exact: true }),
    ).toHaveCount(2);
    await page.reload();
    await expect(
      page.getByRole('button', { name: 'Confirm equipment is physically free', exact: true }),
    ).toHaveCount(2);
    const claims = (await (await page.request.get('/api/v1/kitchen/claims')).json()).claims.filter(
      (claim: { episodeId: string }) => claim.episodeId === sessionId,
    );
    expect(new Set(claims.map((claim: { resourceId: string }) => claim.resourceId)).size).toBe(2);
    const dir = 'screenshots/my-kitchen/meal';
    mkdirSync(dir, { recursive: true });
    for (const [name, width, height, zoom] of [
      ['desktop', 1440, 1000, 1],
      ['mobile', 390, 844, 1],
      ['reflow-320', 320, 844, 1],
      ['short', 390, 560, 1],
      ['enlarged', 850, 1000, 2],
    ] as const) {
      await page.setViewportSize({ width, height });
      await page.evaluate((zoom) => {
        document.documentElement.style.fontSize = `${zoom * 100}%`;
      }, zoom);
      await review.evaluate((element) => element.scrollIntoView({ block: 'center' }));
      expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(
        true,
      );
      await page.screenshot({ path: `${dir}/${name}.png`, fullPage: false });
    }
    expect((await appAxe(page).analyze()).violations).toEqual([]);
    await page
      .getByRole('button', { name: 'Confirm equipment is physically free', exact: true })
      .first()
      .click();
    await expect(
      page.getByRole('button', { name: 'Confirm equipment is physically free', exact: true }),
    ).toHaveCount(1);
    expect(
      (await (await page.request.get('/api/v1/kitchen/claims')).json()).claims.filter(
        (claim: { episodeId: string }) => claim.episodeId === sessionId,
      ),
    ).toHaveLength(1);
    await page
      .getByRole('button', { name: 'Confirm equipment is physically free', exact: true })
      .click();
    writeFileSync(
      `${dir}/manifest.json`,
      JSON.stringify(
        {
          baseRevision: JSON.parse(
            readFileSync('docs/refinement/rc21-source-manifest.json', 'utf8'),
          ).testedRevision,
          buildId: readFileSync('.next/BUILD_ID', 'utf8').trim(),
          sourceDigest: JSON.parse(
            readFileSync('docs/refinement/rc21-source-manifest.json', 'utf8'),
          ).sourceDigest,
          capturedAt: new Date().toISOString(),
          browser: 'Chromium',
          provider: 'No provider calls',
          scope: 'One owned episode, two recipes, two physical bases; estimates only',
        },
        null,
        2,
      ) + '\n',
    );
  } finally {
    if (sessionId) {
      const claims = (
        await (await page.request.get('/api/v1/kitchen/claims')).json()
      ).claims.filter((claim: { episodeId: string }) => claim.episodeId === sessionId);
      for (const claim of claims)
        await page.request.post('/api/v1/kitchen/claims', {
          headers: { Origin: origin },
          data: {
            operation: 'release',
            episodeId: sessionId,
            phaseId: claim.phaseId,
            acknowledged: true,
            expectedUseId: claim.useId,
          },
        });
    }
    for (const id of [...created, ...changed]) {
      const current = await kitchen();
      const item = current.items.find((item: { id: string }) => item.id === id);
      if (item)
        await command({
          kind: 'update',
          itemId: id,
          expectedItemRevision: item.revision,
          item: {
            ...itemInput(item),
            availability: created.includes(id) ? 'archived' : 'available',
          },
        });
    }
    await command({ kind: 'coverage', coverage: before.coverage });
  }
});
