import { rmSync } from 'node:fs';
import { resolve } from 'node:path';
import { afterAll, beforeAll, expect, it, vi } from 'vitest';

const sent = vi.hoisted(() => [] as string[]);
vi.mock('@/lib/auth/email', () => ({
  sendAuthEmail: vi.fn(async (message: { text: string }) => {
    sent.push(message.text);
  }),
}));

const origin = 'http://localhost:3000';
const email = 'sqlite-verification@example.test';
const directory = resolve('.test-data/auth-sqlite-verification');
let password = 'synthetic initial passphrase';
let sessionCookie: string;
let auth: (typeof import('@/lib/auth/server'))['auth'];
let database: typeof import('@/lib/db/client');
let schema: typeof import('@/lib/db/schema');

function cookies(response: Response) {
  return response.headers
    .getSetCookie()
    .map((value) => value.split(';')[0])
    .join('; ');
}

function request(path: string, body?: unknown, cookie?: string) {
  return auth.handler(
    new Request(`${origin}/api/auth${path}`, {
      method: body === undefined ? 'GET' : 'POST',
      headers: {
        origin,
        'content-type': 'application/json',
        ...(cookie ? { cookie } : {}),
      },
      ...(body === undefined ? {} : { body: JSON.stringify(body) }),
    }),
  );
}

async function signIn() {
  const response = await request('/sign-in/email', { email, password });
  expect(response.status).toBe(200);
  return cookies(response);
}

beforeAll(async () => {
  vi.stubEnv('DATA_DIR', directory);
  vi.stubEnv('DATABASE_URL', resolve(directory, 'bord.db'));
  vi.stubEnv('BETTER_AUTH_URL', origin);
  vi.stubEnv('APP_ORIGIN', origin);
  vi.stubEnv('BETTER_AUTH_SECRET', 'sqlite-verification-secret-at-least-thirty-two');
  vi.stubEnv('COOKIE_SECRET', 'sqlite-verification-cookie-at-least-thirty-two');
  vi.stubEnv('AUTH_REQUIRE_EMAIL_VERIFICATION', 'false');
  database = await import('@/lib/db/client');
  database.closeDatabaseConnection();
  ({ auth } = await import('@/lib/auth/server'));
  schema = await import('@/lib/db/schema');
  const accounts = await import('@/lib/services/auth-service');
  const household = await import('@/lib/services/household-service');
  const { defaultProfileInput } = await import('@/lib/domain/setup');
  household.completeSetupWithResult(
    {
      kitchenName: 'SQLite verification fixture',
      profile: { ...defaultProfileInput, displayName: 'Cook' },
    },
    [await accounts.prepareProfileEnrollment('Cook', { email, passphrase: password }, 'admin')],
  );
  sessionCookie = await signIn();
});

afterAll(() => {
  database?.closeDatabaseConnection();
  rmSync(directory, { recursive: true, force: true });
  vi.unstubAllEnvs();
});

it('consumes real passkey challenges once before rejecting the wrong ceremony', async () => {
  const generated = await request(
    '/passkey/generate-authenticate-options',
    undefined,
    sessionCookie,
  );
  expect(generated.status).toBe(200);
  expect(await generated.json()).toMatchObject({ challenge: expect.any(String) });
  expect(database.getDatabase().select().from(schema.verification).all()).toHaveLength(1);
  const cookie = `${sessionCookie}; ${cookies(generated)}`;
  const attempts = await Promise.all([
    request('/passkey/verify-registration', { response: {} }, cookie),
    request('/passkey/verify-registration', { response: {} }, cookie),
  ]);
  for (const response of attempts) {
    expect(response.status).toBe(400);
    expect(await response.json()).toMatchObject({ code: 'CHALLENGE_NOT_FOUND' });
    expect(response.headers.getSetCookie()).toHaveLength(0);
  }
  expect(database.getDatabase().select().from(schema.verification).all()).toHaveLength(0);
  expect(database.getDatabase().select().from(schema.passkey).all()).toHaveLength(0);
  expect(database.getDatabase().select().from(schema.session).all()).toHaveLength(1);
  expect(await (await request('/get-session', undefined, sessionCookie)).json()).toMatchObject({
    user: { email },
  });
});

it('allows exactly one concurrent password reset and revokes the previous sessions', async () => {
  expect((await request('/request-password-reset', { email })).status).toBe(200);
  const link = sent.at(-1)!.match(/https?:\/\/[^\s]+/u)![0];
  const token = new URL(link).pathname.split('/').at(-1)!;
  const newPassword = 'synthetic replacement passphrase';
  const resets = await Promise.all([
    request('/reset-password', { token, newPassword }),
    request('/reset-password', { token, newPassword }),
  ]);
  expect(resets.map((response) => response.status).sort()).toEqual([200, 400]);
  const rejected = resets.find((response) => response.status === 400)!;
  expect(await rejected.json()).toMatchObject({ code: 'INVALID_TOKEN' });
  expect((await request('/reset-password', { token, newPassword })).status).toBe(400);
  expect(await (await request('/get-session', undefined, sessionCookie)).json()).toBeNull();
  expect((await request('/sign-in/email', { email, password })).status).toBe(401);
  password = newPassword;
  const freshCookie = await signIn();
  expect(await (await request('/get-session', undefined, freshCookie)).json()).toMatchObject({
    user: { email },
  });
});
