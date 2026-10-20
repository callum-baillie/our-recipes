import { existsSync, rmSync } from 'node:fs';
import { resolve } from 'node:path';
import { eq } from 'drizzle-orm';
import { NextRequest } from 'next/server';
import { afterAll, expect, it, vi } from 'vitest';

const cleanup = vi.hoisted(() => ({ pause: undefined as undefined | (() => Promise<void>) }));
vi.mock('node:fs/promises', async (original) => {
  const fs = await original<typeof import('node:fs/promises')>();
  return {
    ...fs,
    rm: async (...args: Parameters<typeof fs.rm>) => {
      if (String(args[0]).includes('.restore-new-') && cleanup.pause) await cleanup.pause();
      return fs.rm(...args);
    },
  };
});
const directory = resolve('.test-data/restore-credential-barrier');
let database: typeof import('@/lib/db/client');
afterAll(() => {
  database?.closeDatabaseConnection();
  rmSync(directory, { recursive: true, force: true });
  vi.unstubAllEnvs();
});

it('invalidates backup-era credentials before yielding to cleanup through the real restore handler', async () => {
  const origin = 'http://localhost:3000';
  vi.stubEnv('DATA_DIR', directory);
  vi.stubEnv('DATABASE_URL', resolve(directory, 'bord.db'));
  vi.stubEnv('BETTER_AUTH_URL', origin);
  vi.stubEnv('APP_ORIGIN', origin);
  vi.stubEnv('BETTER_AUTH_SECRET', 'restore-barrier-secret-at-least-thirty-two');
  vi.stubEnv('COOKIE_SECRET', 'restore-barrier-cookie-at-least-thirty-two');
  vi.stubEnv('AUTH_REQUIRE_EMAIL_VERIFICATION', 'false');
  database = await import('@/lib/db/client');
  database.closeDatabaseConnection();
  const { auth } = await import('@/lib/auth/server');
  const accounts = await import('@/lib/services/auth-service');
  const keys = await import('@/lib/services/api-key-service');
  const household = await import('@/lib/services/household-service');
  const { defaultProfileInput } = await import('@/lib/domain/setup');
  const { session, apikey } = await import('@/lib/db/schema');
  const { BACKUP_RESTORE_MARKER } = await import('@/lib/domain/backup-recovery');
  const backups = await import('@/lib/services/backup-service');
  const { POST } = await import('@/app/api/v1/backups/[backupId]/restore/route');
  const { GET: recipes } = await import('@/app/api/v1/recipes/route');
  const { proxy } = await import('@/proxy');
  const email = 'restore-barrier@example.test';
  const password = 'synthetic restore barrier passphrase';
  const enrollment = await accounts.prepareProfileEnrollment(
    'Cook',
    { email, passphrase: password },
    'admin',
  );
  const setup = household.completeSetupWithResult(
    { kitchenName: 'Barrier fixture', profile: { ...defaultProfileInput, displayName: 'Cook' } },
    [enrollment],
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
  const revokedCookie = await signIn();
  const principal = await accounts.requireAdminSession(
    new Request(`${origin}/api/v1/backups`, { headers: { cookie: revokedCookie } }),
  );
  const key = await keys.createAdminApiKey({
    userId: enrollment.user.id,
    profileId: setup.state.profiles[0]!.id,
    name: 'Backup-era fixture',
    expiresInDays: 1,
    permissions: { recipes: ['read'] },
  });
  const backup = await backups.createBackup();
  database.getDatabase().delete(session).where(eq(session.id, principal.sessionId!)).run();
  database
    .getDatabase()
    .update(apikey)
    .set({ enabled: false })
    .where(eq(apikey.id, key.apiKey.id))
    .run();
  const currentCookie = await signIn();
  let resume!: () => void;
  let entered!: () => void;
  const reached = new Promise<void>((resolve) => {
    entered = resolve;
  });
  const paused = new Promise<void>((resolve) => {
    resume = resolve;
  });
  cleanup.pause = async () => {
    entered();
    await paused;
  };
  const restoring = POST(
    new Request(`${origin}/api/v1/backups/${backup.id}/restore`, {
      method: 'POST',
      headers: { cookie: currentCookie, origin, 'content-type': 'application/json' },
      body: JSON.stringify({ confirmation: 'RESTORE' }),
    }),
    { params: Promise.resolve({ backupId: backup.id }) },
  );
  try {
    await reached;
    expect(existsSync(resolve(directory, BACKUP_RESTORE_MARKER))).toBe(false);
    expect(
      await auth.api.getSession({ headers: new Headers({ cookie: revokedCookie }) }),
    ).toBeNull();
    expect(
      (
        await proxy(
          new NextRequest(`${origin}/api/v1/recipes`, { headers: { cookie: revokedCookie } }),
        )
      ).status,
    ).toBe(401);
    expect(
      (
        await recipes(
          new Request(`${origin}/api/v1/recipes`, {
            headers: { authorization: `Bearer ${key.secret}` },
          }),
        )
      ).status,
    ).toBe(401);
  } finally {
    cleanup.pause = undefined;
    resume();
    await restoring;
  }
  expect((await restoring).status).toBe(200);
  expect(await auth.api.getSession({ headers: new Headers({ cookie: currentCookie }) })).toBeNull();
  const fresh = await signIn();
  expect(
    (await proxy(new NextRequest(`${origin}/api/v1/recipes`, { headers: { cookie: fresh } })))
      .status,
  ).toBe(200);
  // Even an invalidation failure after its transaction must restore the current
  // database before normal access resumes; it cannot acknowledge the replacement.
  const failedBackup = await backups.createBackup();
  const invalidate = accounts.invalidateAuthenticationAfterRestore;
  const failing = vi
    .spyOn(accounts, 'invalidateAuthenticationAfterRestore')
    .mockImplementation(() => {
      expect(existsSync(resolve(directory, BACKUP_RESTORE_MARKER))).toBe(true);
      invalidate();
      throw new Error('Controlled invalidation audit failure');
    });
  try {
    const response = await POST(
      new Request(`${origin}/api/v1/backups/${failedBackup.id}/restore`, {
        method: 'POST',
        headers: { cookie: fresh, origin, 'content-type': 'application/json' },
        body: JSON.stringify({ confirmation: 'RESTORE' }),
      }),
      { params: Promise.resolve({ backupId: failedBackup.id }) },
    );
    expect(response.status).toBe(409);
    expect(failing).toHaveBeenCalledOnce();
    expect(existsSync(resolve(directory, BACKUP_RESTORE_MARKER))).toBe(false);
    expect(
      (await auth.api.getSession({ headers: new Headers({ cookie: fresh }) }))?.user.email,
    ).toBe(email);
    expect(
      await auth.api.getSession({ headers: new Headers({ cookie: revokedCookie }) }),
    ).toBeNull();
  } finally {
    failing.mockRestore();
  }
}, 30_000);
