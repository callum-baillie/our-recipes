import { rmSync } from 'node:fs';
import { resolve } from 'node:path';
import { afterAll, expect, it, vi } from 'vitest';

const directory = resolve('.test-data/restore-auth-reconnection');
let database: typeof import('@/lib/db/client');
afterAll(() => {
  database?.closeDatabaseConnection();
  rmSync(directory, { recursive: true, force: true });
  vi.unstubAllEnvs();
});

it('rejects restored/revoked sessions and permits fresh sign-in through the existing auth instance', async () => {
  const origin = 'http://localhost:3000';
  const email = 'restore-auth@example.test';
  const password = 'synthetic restore auth passphrase';
  vi.stubEnv('DATA_DIR', directory);
  vi.stubEnv('DATABASE_URL', resolve(directory, 'bord.db'));
  vi.stubEnv('BETTER_AUTH_URL', origin);
  vi.stubEnv('APP_ORIGIN', origin);
  vi.stubEnv('BETTER_AUTH_SECRET', 'restore-fixture-auth-secret-at-least-thirty-two');
  vi.stubEnv('COOKIE_SECRET', 'restore-fixture-cookie-secret-at-least-thirty-two');
  vi.stubEnv('AUTH_REQUIRE_EMAIL_VERIFICATION', 'false');
  database = await import('@/lib/db/client');
  database.closeDatabaseConnection();
  const { auth } = await import('@/lib/auth/server');
  const accounts = await import('@/lib/services/auth-service');
  const household = await import('@/lib/services/household-service');
  const { defaultProfileInput } = await import('@/lib/domain/setup');
  const backups = await import('@/lib/services/backup-service');
  household.completeSetupWithResult(
    { kitchenName: 'Restore fixture', profile: { ...defaultProfileInput, displayName: 'Cook' } },
    [await accounts.prepareProfileEnrollment('Cook', { email, passphrase: password }, 'admin')],
  );
  const signIn = async () => {
    const response = await auth.api.signInEmail({
      body: { email, password },
      headers: new Headers({ origin }),
      asResponse: true,
    });
    expect(response.status).toBe(200);
    return response.headers
      .getSetCookie()
      .map((value) => value.split(';')[0])
      .join('; ');
  };
  const cookie = await signIn();
  expect((await auth.api.getSession({ headers: new Headers({ cookie }) }))?.user.email).toBe(email);
  const backup = await backups.createBackup();
  await backups.restoreBackup(backup.id);
  accounts.invalidateAuthenticationAfterRestore();
  expect(await auth.api.getSession({ headers: new Headers({ cookie }) })).toBeNull();
  const fresh = await signIn();
  expect((await auth.api.getSession({ headers: new Headers({ cookie: fresh }) }))?.user.email).toBe(
    email,
  );
}, 20_000);
