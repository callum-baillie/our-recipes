import { afterAll, beforeAll, describe, expect, it, vi } from 'vitest';
import { eq } from 'drizzle-orm';
import { NextRequest } from 'next/server';

const origin = 'http://localhost:3000';
const passphrase = 'correct horse battery table';
let auth: (typeof import('@/lib/auth/server'))['auth'];
let db: typeof import('@/lib/db/client');
let schema: typeof import('@/lib/db/schema');
let keys: typeof import('@/lib/services/api-key-service');
let authentication: typeof import('@/lib/services/auth-service');
let userId: string;
let profileId: string;
let cookie: string;

async function signIn() {
  const response = await auth.api.signInEmail({
    body: { email: 'api-review@example.test', password: passphrase },
    headers: new Headers({ origin }),
    asResponse: true,
  });
  expect(response.status).toBe(200);
  return response.headers
    .getSetCookie()
    .map((value) => value.split(';')[0])
    .join('; ');
}
function request(
  path: string,
  options: { key?: string; cookie?: string; method?: string; body?: unknown; origin?: string } = {},
) {
  return new Request(`${origin}/api/v1${path}`, {
    method: options.method ?? 'GET',
    headers: {
      ...(options.key ? { authorization: `Bearer ${options.key}` } : {}),
      ...(options.cookie ? { cookie: options.cookie } : {}),
      ...(options.origin ? { origin: options.origin } : {}),
      'content-type': 'application/json',
    },
    ...(options.body !== undefined ? { body: JSON.stringify(options.body) } : {}),
  });
}
async function createKey(permissions: import('@/lib/domain/auth').ApiPermissions) {
  return keys.createAdminApiKey({
    userId,
    profileId,
    name: 'Regression key',
    expiresInDays: 30,
    permissions,
  });
}

beforeAll(async () => {
  vi.stubEnv('DATABASE_URL', ':memory:');
  vi.stubEnv('DATA_DIR', './.test-data/api-key-access');
  vi.stubEnv('BETTER_AUTH_URL', origin);
  vi.stubEnv('APP_ORIGIN', origin);
  vi.stubEnv('COOKIE_SECRET', 'test-cookie-secret-for-api-access-regressions');
  vi.stubEnv('BETTER_AUTH_SECRET', 'test-auth-secret-for-api-access-regressions');
  vi.stubEnv('AUTH_REQUIRE_EMAIL_VERIFICATION', 'false');
  ({ auth } = await import('@/lib/auth/server'));
  db = await import('@/lib/db/client');
  schema = await import('@/lib/db/schema');
  keys = await import('@/lib/services/api-key-service');
  authentication = await import('@/lib/services/auth-service');
  const enrollment = await authentication.prepareProfileEnrollment(
    'Admin',
    {
      email: 'api-review@example.test',
      passphrase,
    },
    'admin',
  );
  const { completeSetupWithResult } = await import('@/lib/services/household-service');
  const setup = completeSetupWithResult(
    {
      kitchenName: 'API test kitchen',
      profile: {
        displayName: 'Admin',
        color: '#637A45',
        avatarUrl: '',
        units: 'metric',
        temperatureUnit: 'C',
        locale: 'en-GB',
        timezone: 'Europe/London',
      },
    },
    [enrollment],
  );
  profileId = setup.state.profiles[0]!.id;
  userId = enrollment.user.id;
  cookie = await signIn();
});
afterAll(() => {
  db?.resetDatabaseForTests();
  vi.unstubAllEnvs();
});

describe('real authenticated integration access', () => {
  it('rejects an old admin session and allows key creation after signing in again', async () => {
    const principal = await authentication.requireAdminSession(
      request('/admin/api-keys', { cookie }),
    );
    db.getDatabase()
      .update(schema.session)
      .set({ createdAt: new Date(Date.now() - 11 * 60_000) })
      .where(eq(schema.session.id, principal.sessionId!))
      .run();
    const { POST } = await import('@/app/api/v1/admin/api-keys/route');
    const body = { name: 'After confirming', permissions: { recipes: ['read'] } };
    const old = await POST(request('/admin/api-keys', { cookie, origin, method: 'POST', body }));
    expect(old.status).toBe(403);
    expect(await old.json()).toMatchObject({ error: { code: 'fresh_admin_session_required' } });
    cookie = await signIn();
    const fresh = await POST(request('/admin/api-keys', { cookie, origin, method: 'POST', body }));
    expect(fresh.status).toBe(201);
    const created = await fresh.json();
    expect(created.secret).toMatch(/^bord_sk_/u);
    expect(created.apiKey.permissions).toEqual({ recipes: ['read'] });
  });

  it('allows scoped bearer operations without cookies or Origin and attributes the owner', async () => {
    const { secret } = await createKey({
      pantry: ['read', 'create'],
      recipes: ['create', 'read'],
      settings: ['read'],
    });
    const locations = await import('@/app/api/v1/pantry/locations/route');
    const response = await locations.POST(
      request('/pantry/locations', {
        key: secret,
        method: 'POST',
        body: { name: 'API cupboard', storageType: 'pantry' },
      }),
    );
    expect(response.status).toBe(201);
    expect((await locations.GET(request('/pantry/locations', { key: secret }))).status).toBe(200);
    const actor = await authentication.authenticateApiRequest(
      request('/pantry/locations', { key: secret }),
      'pantry',
      'read',
    );
    expect(actor).toMatchObject({ kind: 'api-key', profileId, userId });
    const settings = await import('@/app/api/v1/settings/preferences/route');
    expect((await settings.GET(request('/settings/preferences', { key: secret }))).status).toBe(
      200,
    );
  });

  it('returns 403 for missing permissions and 401 for missing credentials', async () => {
    const { secret } = await createKey({ pantry: ['read'] });
    const { POST, GET } = await import('@/app/api/v1/pantry/locations/route');
    const denied = await POST(
      request('/pantry/locations', { key: secret, method: 'POST', body: { name: 'Denied' } }),
    );
    expect(denied.status).toBe(403);
    expect(await denied.json()).toMatchObject({
      error: { code: 'insufficient_api_key_permissions' },
    });
    expect((await GET(request('/pantry/locations'))).status).toBe(401);
    const settings = await import('@/app/api/v1/settings/preferences/route');
    expect((await settings.GET(request('/settings/preferences', { key: secret }))).status).toBe(
      403,
    );
  });

  it('preserves exact Origin checks for cookie sessions', async () => {
    const { POST } = await import('@/app/api/v1/tags/route');
    for (const originValue of [undefined, `${origin}.evil.example`]) {
      expect(
        (
          await POST(
            request('/tags', {
              cookie,
              origin: originValue,
              method: 'POST',
              body: { name: 'Unsafe' },
            }),
          )
        ).status,
      ).toBe(403);
    }
    expect(
      (
        await POST(
          request('/tags', {
            cookie,
            origin,
            method: 'POST',
            body: { name: 'Weeknight', color: '#637A45' },
          }),
        )
      ).status,
    ).toBe(201);
  });

  it('requires pantry permission for a stock-changing cooking workflow', async () => {
    const { secret } = await createKey({ recipes: ['update'] });
    const { POST } = await import('@/app/api/v1/cook-sessions/[sessionId]/complete/route');
    const response = await POST(
      request('/cook-sessions/00000000-0000-4000-8000-000000000001/complete', {
        key: secret,
        method: 'POST',
        body: {},
      }),
      { params: Promise.resolve({ sessionId: '00000000-0000-4000-8000-000000000001' }) },
    );
    expect(response.status).toBe(403);
    expect((await response.json()).error.message).toContain('pantry:update');
  });

  it('rejects revoked keys and preserves access through their replacements', async () => {
    const key = await createKey({ pantry: ['read'] });
    const replacement = await keys.rotateAdminApiKey({ userId, profileId, keyId: key.apiKey.id });
    const { GET } = await import('@/app/api/v1/pantry/locations/route');
    expect((await GET(request('/pantry/locations', { key: key.secret }))).status).toBe(401);
    expect((await GET(request('/pantry/locations', { key: replacement.secret }))).status).toBe(200);
  });

  it('enforces expiry and returns 429 with Retry-After for rate limits', async () => {
    const expired = await createKey({ pantry: ['read'] });
    db.getDatabase()
      .update(schema.apikey)
      .set({ expiresAt: new Date(Date.now() - 1000) })
      .where(eq(schema.apikey.id, expired.apiKey.id))
      .run();
    const { GET } = await import('@/app/api/v1/pantry/locations/route');
    expect((await GET(request('/pantry/locations', { key: expired.secret }))).status).toBe(401);
    const limited = await createKey({ pantry: ['read'] });
    db.getDatabase()
      .update(schema.apikey)
      .set({ rateLimitMax: 1 })
      .where(eq(schema.apikey.id, limited.apiKey.id))
      .run();
    expect((await GET(request('/pantry/locations', { key: limited.secret }))).status).toBe(200);
    const response = await GET(request('/pantry/locations', { key: limited.secret }));
    expect(response.status).toBe(429);
    expect(response.headers.get('Retry-After')).toBe('60');
  });

  it('allows explicit reauthentication and the dedicated Homepage token route through the proxy', async () => {
    const { proxy } = await import('@/proxy');
    const reauth = await proxy(
      new NextRequest(`${origin}/sign-in?reauth=1&callbackUrl=/settings/api`, {
        headers: { cookie },
      }),
    );
    expect(reauth.headers.get('location')).toBeNull();
    const homepage = await proxy(
      new NextRequest(`${origin}/api/integrations/homepage/v1/summary`, {
        headers: { authorization: 'Bearer homepage-token' },
      }),
    );
    expect(homepage.headers.get('x-middleware-next')).toBe('1');
    const blocked = await proxy(
      new NextRequest(`${origin}/api/v1/admin/api-keys`, {
        headers: { authorization: 'Bearer bord_sk_fake' },
      }),
    );
    expect(blocked.status).toBe(403);
    const fakeAsset = await proxy(new NextRequest(`${origin}/api/v1/imports/fake.json`));
    expect(fakeAsset.status).toBe(401);
  });
});
