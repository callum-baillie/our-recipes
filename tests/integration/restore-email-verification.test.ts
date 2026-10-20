import { rmSync } from 'node:fs';
import { resolve } from 'node:path';
import { afterAll, expect, it, vi } from 'vitest';
const sent = vi.hoisted(() => [] as string[]);
vi.mock('@/lib/auth/email', () => ({
  sendAuthEmail: vi.fn(async (message: { text: string }) => {
    sent.push(message.text);
  }),
}));
const directory = resolve('.test-data/restore-email-verification');
let database: typeof import('@/lib/db/client');
afterAll(() => {
  database?.closeDatabaseConnection();
  rmSync(directory, { recursive: true, force: true });
  vi.unstubAllEnvs();
});
it('rejects restored verification links and accepts fresh links with the effective library signing key', async () => {
  const origin = 'http://localhost:3000';
  vi.stubEnv('DATA_DIR', directory);
  vi.stubEnv('DATABASE_URL', resolve(directory, 'bord.db'));
  vi.stubEnv('BETTER_AUTH_URL', origin);
  vi.stubEnv('APP_ORIGIN', origin);
  vi.stubEnv('BETTER_AUTH_SECRET', 'restore-email-secret-at-least-thirty-two');
  vi.stubEnv('BETTER_AUTH_SECRETS', '2:restore-email-current-key-at-least-thirty-two');
  vi.stubEnv('COOKIE_SECRET', 'restore-email-cookie-at-least-thirty-two');
  vi.stubEnv('AUTH_REQUIRE_EMAIL_VERIFICATION', 'true');
  database = await import('@/lib/db/client');
  database.closeDatabaseConnection();
  const { auth } = await import('@/lib/auth/server');
  expect((await auth.$context).secret).toBe('restore-email-current-key-at-least-thirty-two');
  const accounts = await import('@/lib/services/auth-service');
  const household = await import('@/lib/services/household-service');
  const { defaultProfileInput } = await import('@/lib/domain/setup');
  const backups = await import('@/lib/services/backup-service');
  const { POST: restore } = await import('@/app/api/v1/backups/[backupId]/restore/route');
  const email = 'restore-verification@example.test';
  household.completeSetupWithResult(
    {
      kitchenName: 'Verification fixture',
      profile: { ...defaultProfileInput, displayName: 'Cook' },
    },
    [
      await accounts.prepareProfileEnrollment(
        'Cook',
        { email, passphrase: 'synthetic verification passphrase' },
        'admin',
      ),
    ],
  );
  const issue = async () => {
    const response = await auth.handler(
      new Request(`${origin}/api/auth/send-verification-email`, {
        method: 'POST',
        headers: { origin, 'content-type': 'application/json' },
        body: JSON.stringify({ email }),
      }),
    );
    expect(response.status).toBe(200);
    expect(sent.length).toBeGreaterThan(0);
    const link = sent.at(-1)!.match(/https?:\/\/[^\s]+/u)![0];
    return new URL(link).searchParams.get('token')!;
  };
  const verify = (token: string) =>
    auth.handler(
      new Request(`${origin}/api/auth/verify-email?token=${encodeURIComponent(token)}`, {
        headers: { origin },
      }),
    );
  const oldToken = await issue();
  const backup = await backups.createBackup();
  const verified = await verify(oldToken);
  expect(verified.status).toBe(200);
  const cookie = verified.headers
    .getSetCookie()
    .map((value) => value.split(';')[0])
    .join('; ');
  expect((await auth.api.getSession({ headers: new Headers({ cookie }) }))?.user.email).toBe(email);
  const response = await restore(
    new Request(`${origin}/api/v1/backups/${backup.id}/restore`, {
      method: 'POST',
      headers: { cookie, origin, 'content-type': 'application/json' },
      body: JSON.stringify({ confirmation: 'RESTORE' }),
    }),
    { params: Promise.resolve({ backupId: backup.id }) },
  );
  expect(response.status).toBe(200);
  const replay = await verify(oldToken);
  expect(replay.status).toBe(401);
  expect(replay.headers.getSetCookie()).toHaveLength(0);
  const freshToken = await issue();
  expect(freshToken).not.toBe(oldToken);
  const fresh = await verify(freshToken);
  expect(fresh.status).toBe(200);
  const freshCookie = fresh.headers
    .getSetCookie()
    .map((value) => value.split(';')[0])
    .join('; ');
  expect(
    (await auth.api.getSession({ headers: new Headers({ cookie: freshCookie }) }))?.user.email,
  ).toBe(email);
  expect((await verify(freshToken)).status).toBe(401);
}, 30_000);
