import { expect, test } from '@playwright/test';
import { mkdirSync, writeFileSync } from 'node:fs';
import { execFileSync } from 'node:child_process';
import { TEST_PASSPHRASE } from './helpers/onboarding';

test('virtual passkey enrollment, sign-in, removal and session revocation use real auth handlers', async ({
  page,
  baseURL,
}) => {
  test.setTimeout(90_000);
  expect(baseURL).toBe('http://localhost:3100');
  const signedIn = await page.request.post('/api/auth/sign-in/email', {
    headers: { Origin: baseURL! },
    data: { email: 'workflow-refinement-fixture-maya@example.test', password: TEST_PASSPHRASE },
  });
  expect(signedIn.ok()).toBe(true);
  const cdp = await page.context().newCDPSession(page);
  await cdp.send('WebAuthn.enable');
  const { authenticatorId } = await cdp.send('WebAuthn.addVirtualAuthenticator', {
    options: {
      protocol: 'ctap2',
      transport: 'internal',
      hasResidentKey: true,
      hasUserVerification: true,
      isUserVerified: true,
      automaticPresenceSimulation: true,
    },
  });
  const directory = 'screenshots/post-review/auth';
  mkdirSync(directory, { recursive: true });
  const signOut = async () => {
    const cookie = (await page.context().cookies())
      .map(({ name, value }) => `${name}=${value}`)
      .join('; ');
    const result = await page.request.post('/api/auth/sign-out', {
      headers: { Origin: baseURL! },
      data: {},
    });
    expect(result.ok()).toBe(true);
    expect(await (await page.request.get('/api/auth/get-session')).json()).toBeNull();
    const revoked = await page.request.get('/api/v1/recipes', { headers: { Cookie: cookie } });
    expect(revoked.status()).toBe(401);
  };
  try {
    await page.setViewportSize({ width: 390, height: 844 });
    await page.goto('/account/security');
    await page
      .getByLabel('Passkey name (optional)', { exact: true })
      .fill('Synthetic Chromium credential');
    await page.getByRole('button', { name: 'Add passkey', exact: true }).click();
    await expect(page.getByText('Passkey added.', { exact: true })).toBeVisible();
    await expect(page.getByText('Synthetic Chromium credential', { exact: true })).toBeVisible();
    await page
      .getByRole('button', { name: 'Remove Synthetic Chromium credential', exact: true })
      .scrollIntoViewIfNeeded();
    await page.screenshot({ path: `${directory}/virtual-passkey-enrolled-390.png` });
    await signOut();
    await page.goto('/sign-in');
    await page.getByRole('button', { name: 'Use a passkey', exact: true }).click();
    await page.waitForURL((url) => url.pathname !== '/sign-in');
    const session = await (await page.request.get('/api/auth/get-session')).json();
    expect(session?.user?.email).toBe('workflow-refinement-fixture-maya@example.test');
    await page.goto('/account/security');
    await page
      .getByRole('button', { name: 'Remove Synthetic Chromium credential', exact: true })
      .click();
    await page.getByRole('button', { name: 'Confirm removal', exact: true }).press('Enter');
    await expect(page.getByText('Passkey removed.', { exact: true })).toBeVisible();
    await expect(page.locator('#saved-passkeys')).toBeFocused();
    await signOut();
    await page.goto('/sign-in');
    await page.getByRole('button', { name: 'Use a passkey', exact: true }).click();
    await expect(page.locator('.auth-feedback[role="alert"]')).toBeVisible();
    await expect(page.getByRole('button', { name: 'Use a passkey', exact: true })).toBeEnabled();
    await expect(page.getByRole('button', { name: 'Sign in', exact: true })).toBeEnabled();
    await page.screenshot({ path: `${directory}/removed-virtual-passkey-recovery-390.png` });
    await page
      .getByLabel('Email', { exact: true })
      .fill('workflow-refinement-fixture-maya@example.test');
    await page.getByLabel('Passphrase', { exact: true }).fill(TEST_PASSPHRASE);
    await page.getByRole('button', { name: 'Sign in', exact: true }).click();
    await page.waitForURL((url) => url.pathname !== '/sign-in');
    expect((await (await page.request.get('/api/auth/get-session')).json())?.user?.email).toBe(
      'workflow-refinement-fixture-maya@example.test',
    );
    writeFileSync(
      `${directory}/manifest.json`,
      JSON.stringify(
        {
          revision: execFileSync('git', ['rev-parse', 'HEAD'], { encoding: 'utf8' }).trim(),
          capturedAt: new Date().toISOString(),
          state:
            'Synthetic account and Chromium CDP virtual authenticator; real Better Auth handlers, no physical passkey or email',
          viewport: '390x844',
        },
        null,
        2,
      ),
    );
  } finally {
    await cdp.send('WebAuthn.removeVirtualAuthenticator', { authenticatorId });
    await cdp.detach();
  }
});
