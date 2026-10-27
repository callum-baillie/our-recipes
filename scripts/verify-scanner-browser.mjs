/** One-shot browser oracle against the synthetic scanner fixture, never a real household. */
import { isDeepStrictEqual } from 'node:util';
import { chromium } from 'playwright';
import { readFileSync, mkdirSync, writeFileSync } from 'node:fs';
import { resolve } from 'node:path';
const origin = 'https://bord-scanner.dev.app.devbox';
const bridge = resolve('../bord-scanner-companion');
const access = readFileSync(resolve(bridge, 'var/demo-access.txt'), 'utf8');
const email = access.match(/^Email: (.+)$/m)?.[1],
  password = access.match(/^Passphrase: (.+)$/m)?.[1];
if (!access.startsWith(`Development synthetic Bòrd: ${origin}`) || !email || !password)
  throw Error('Only the synthetic scanner demo is supported.');
const output = resolve('.test-data/scanner-browser');
mkdirSync(output, { recursive: true });
const browser = await chromium.launch({ headless: true, chromiumSandbox: true });
const context = await browser.newContext({
  ignoreHTTPSErrors: true,
  viewport: { width: 1440, height: 1000 },
});
const page = await context.newPage(),
  errors = [];
page.on('pageerror', (e) => errors.push(e.message));
const results = {};
try {
  page.setDefaultTimeout(45000);
  await page.goto(origin + '/sign-in');
  await page.getByRole('textbox', { name: 'Email', exact: true }).fill(email);
  await page.getByRole('textbox', { name: 'Passphrase', exact: true }).fill(password);
  await page.getByRole('button', { name: 'Sign in', exact: true }).click();
  await page.waitForURL((url) => !url.pathname.startsWith('/sign-in'));
  await page.goto(origin + '/scanner');
  await page.getByRole('heading', { name: 'Scanner station', exact: true }).waitFor();
  await page.getByRole('heading', { name: /Development kitchen/ }).waitFor();
  results.loaded = true;
  await page.getByLabel('Retail barcode', { exact: true }).fill('012345678905');
  await page
    .getByRole('combobox', { name: /Destination \/ saved location/ })
    .selectOption({ label: 'Kitchen pantry' });
  await page.getByRole('button', { name: 'Look up', exact: true }).click();
  await page.getByRole('heading', { name: 'Demo lentils', exact: true }).waitFor();
  results.localLookup = true;
  let lostBody, retriedBody, interceptionError, completeInterception;
  const interrupted = new Promise((resolve) => {
    completeInterception = resolve;
  });
  await page.route('**/api/v1/scanner/operations', async (route) => {
    if (!lostBody) {
      lostBody = route.request().postDataJSON();
      try {
        const response = await route.fetch();
        if (response.status() !== 200)
          throw Error(`Synthetic operation returned HTTP ${response.status()}`);
        await route.abort('failed').catch(() => {});
      } catch (error) {
        interceptionError = String(error.message).split('\n')[0];
      } finally {
        completeInterception();
      }
    } else {
      retriedBody = route.request().postDataJSON();
      await route.continue().catch(() => {});
    }
  });
  await page.getByRole('button', { name: 'Save reviewed packages', exact: true }).click();
  await interrupted;
  if (interceptionError) throw Error(interceptionError);
  await page.getByRole('button', { name: 'Retry saved operation', exact: true }).waitFor();
  await page.reload();
  await page.getByRole('button', { name: 'Retry saved operation', exact: true }).click();

  await page.getByRole('status').filter({ hasText: /Added/ }).waitFor();
  results.packageAdd = true;
  if (!isDeepStrictEqual(lostBody, retriedBody)) throw Error('Browser retry changed the operation');
  results.lostReplyReloadRetry = true;
  await page.unroute('**/api/v1/scanner/operations');
  await page.getByRole('button', { name: 'LOOKUP', exact: true }).click();
  await page
    .locator('[aria-label="Station mode"]')
    .filter({ hasText: /^LOOKUP$/ })
    .waitFor({ timeout: 45000 });
  results.remoteControl = true;
  await page.getByLabel('Retail barcode', { exact: true }).fill('012345678905');
  await page.getByRole('button', { name: 'Look up', exact: true }).click();
  await page.getByRole('heading', { name: 'Demo lentils', exact: true }).waitFor();
  await page.getByRole('button', { name: 'Review this batch', exact: true }).first().click();
  await page.getByRole('button', { name: 'Look up', exact: true }).click();
  await page.getByLabel(/Counted quantity/).fill('9000');
  await page.getByRole('button', { name: 'Add count to draft', exact: true }).click();
  await page.getByRole('heading', { name: /Review stocktake draft/ }).waitFor();
  await page.reload();
  await page.getByRole('heading', { name: /Review stocktake draft/ }).waitFor();
  await page.getByRole('button', { name: 'Apply reviewed count draft', exact: true }).click();
  await page
    .getByRole('status')
    .filter({ hasText: /Saved 1 reviewed batch counts/ })
    .waitFor();
  results.stocktakeReloadAndSave = true;

  await page.screenshot({ path: resolve(output, 'desktop.png'), fullPage: true });
  await page.setViewportSize({ width: 390, height: 844 });
  await page.screenshot({ path: resolve(output, 'mobile.png'), fullPage: true });
  results.mobileOverflow = await page.evaluate(
    () => document.documentElement.scrollWidth > innerWidth,
  );
  if (results.mobileOverflow) throw Error('Scanner page overflows mobile viewport');
  const pdf = await context.request.get(
    origin + '/api/v1/scanner/cards?kind=recipe&id=00000000-0000-4000-8000-000000000201',
    { timeout: 60000 },
  );
  if (pdf.status() !== 200 || !pdf.headers()['content-type'].includes('pdf'))
    throw Error('Scanner recipe PDF failed');
  writeFileSync(resolve(output, 'recipe-card.pdf'), await pdf.body());
  results.recipePdf = true;
  const unknown = await context.request.post(origin + '/api/v1/scanner/lookups', {
    headers: { origin },
    data: { stationId: 'dev-kitchen', barcode: '041498926526' },
  });
  const match = await unknown.json();
  results.catalogLookup = {
    status: unknown.status(),
    kind: match.kind,
    provider: match.catalog?.preferred?.provider,
    name: match.catalog?.preferred?.displayName,
    providers: match.catalog?.providerStatuses?.map((p) => ({
      provider: p.provider,
      status: p.status,
    })),
    errorCode: match.error?.code,
  };
  if (
    unknown.status() !== 200 ||
    match.kind !== 'review' ||
    match.catalog?.preferred?.provider !== 'usda_fdc'
  )
    throw Error('Catalog review lookup failed');
  results.pageErrors = errors;
  if (errors.length) throw Error(errors.join('\n'));
  writeFileSync(resolve(output, 'results.json'), JSON.stringify(results, null, 2));
  console.log(JSON.stringify(results, null, 2));
} catch (error) {
  console.log(JSON.stringify(results, null, 2));
  await page
    .screenshot({ path: resolve(output, 'failure.png'), fullPage: true, timeout: 10000 })
    .catch(() => {});
  writeFileSync(resolve(output, 'failure.txt'), await page.locator('body').innerText());
  console.error(
    String(error.message).split('\n')[0],
    String(error.stack)
      .split('\n')
      .find((line) => line.includes('verify-scanner-browser.mjs')) ?? '',
  );
  process.exitCode = 1;
} finally {
  await context.request
    .post(origin + '/api/auth/sign-out', { headers: { origin }, timeout: 10000 })
    .catch(() => {});
  await browser.close();
}
