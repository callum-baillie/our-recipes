import { afterAll, beforeAll, describe, expect, it, vi } from 'vitest';
import { eq } from 'drizzle-orm';
import { NextRequest } from 'next/server';
const origin = 'http://localhost:3000';
const passphrase = 'synthetic nutrition account passphrase';
let auth: (typeof import('@/lib/auth/server'))['auth'];
let authentication: typeof import('@/lib/services/auth-service');
let database: typeof import('@/lib/db/client');
let schema: typeof import('@/lib/db/schema');
let identities: typeof import('@/lib/actor-context');
let nutrition: typeof import('@/lib/services/nutrition-profile-service');
let routes: typeof import('@/app/api/v1/nutrition/profiles/[profileId]/route');
let sessions: typeof import('@/app/api/v1/nutrition/session/route');
let roster: typeof import('@/app/api/v1/nutrition/profiles/route');
let shared: typeof import('@/app/api/v1/nutrition/_shared');
let adminId: string;
let parentId: string;
let childId: string;
let parentCookie = '';
let childCookie = '';
function request(path: string, cookie = '', body?: object) {
  return new Request(`${origin}/api/v1/nutrition${path}`, {
    method: body ? 'PATCH' : 'GET',
    headers: { origin, cookie, 'content-type': 'application/json' },
    ...(body ? { body: JSON.stringify(body) } : {}),
  });
}
async function signIn(email: string) {
  const response = await auth.api.signInEmail({
    body: { email, password: passphrase },
    headers: new Headers({ origin }),
    asResponse: true,
  });
  expect(response.status).toBe(200);
  return response.headers
    .getSetCookie()
    .map((value) => value.split(';')[0])
    .join('; ');
}
async function viewed(cookie: string, profileId: string) {
  const principal = await authentication.getAuthenticatedSessionPrincipal(
    request('/session', cookie),
  );
  return `${cookie}; bord_active_profile=${identities.createSignedProfileValue(profileId, principal!.sessionId!)}`;
}
beforeAll(async () => {
  vi.stubEnv('DATABASE_URL', ':memory:');
  vi.stubEnv('DATA_DIR', '.test-data/nutrition-session-authorization');
  vi.stubEnv('BETTER_AUTH_URL', origin);
  vi.stubEnv('APP_ORIGIN', origin);
  vi.stubEnv('COOKIE_SECRET', 'nutrition-fixture-cookie-secret-at-least-thirty-two');
  vi.stubEnv('BETTER_AUTH_SECRET', 'nutrition-fixture-auth-secret-at-least-thirty-two');
  vi.stubEnv('AUTH_REQUIRE_EMAIL_VERIFICATION', 'false');
  vi.stubEnv('OPENAI_API_KEY', '');
  database = await import('@/lib/db/client');
  database.resetDatabaseForTests();
  ({ auth } = await import('@/lib/auth/server'));
  authentication = await import('@/lib/services/auth-service');
  identities = await import('@/lib/actor-context');
  schema = await import('@/lib/db/schema');
  nutrition = await import('@/lib/services/nutrition-profile-service');
  const household = await import('@/lib/services/household-service');
  const { defaultProfileInput, onboardingNutritionSchema } = await import('@/lib/domain/setup');
  const enroll = (name: string, role: 'admin' | 'parent' | 'child') =>
    authentication.prepareProfileEnrollment(
      name,
      { email: `${name.toLowerCase()}-nutrition@example.test`, passphrase },
      role,
    );
  adminId = household.completeSetupWithResult(
    { kitchenName: 'Nutrition fixture', profile: { ...defaultProfileInput, displayName: 'Alex' } },
    [await enroll('Alex', 'admin')],
  ).state.profiles[0]!.id;
  parentId = household.onboardProfileWithEnrollment(
    {
      role: 'parent',
      profile: { ...defaultProfileInput, displayName: 'Pat' },
      nutrition: onboardingNutritionSchema.parse({ profileType: 'adult' }),
    },
    await enroll('Pat', 'parent'),
  ).profile.id;
  childId = household.onboardProfileWithEnrollment(
    {
      role: 'child',
      profile: { ...defaultProfileInput, displayName: 'Casey' },
      nutrition: onboardingNutritionSchema.parse({ profileType: 'dependent' }),
    },
    await enroll('Casey', 'child'),
  ).profile.id;
  parentCookie = await signIn('pat-nutrition@example.test');
  childCookie = await signIn('casey-nutrition@example.test');
  routes = await import('@/app/api/v1/nutrition/profiles/[profileId]/route');
  sessions = await import('@/app/api/v1/nutrition/session/route');
  roster = await import('@/app/api/v1/nutrition/profiles/route');
  shared = await import('@/app/api/v1/nutrition/_shared');
}, 30_000);
afterAll(() => {
  database?.resetDatabaseForTests();
  vi.unstubAllEnvs();
});
describe('Nutrition direct session and subject boundary', () => {
  it('rejects a signed profile cookie without an authenticated account', async () => {
    const cookie = `bord_active_profile=${identities.createSignedProfileValue(adminId)}`;
    expect((await sessions.GET(request('/session', cookie))).status).toBe(401);
    expect(
      (
        await routes.GET(request(`/profiles/${adminId}`, cookie), {
          params: Promise.resolve({ profileId: adminId }),
        })
      ).status,
    ).toBe(401);
  });
  it('keeps the account actor distinct from the viewed person and does not grant their writes', async () => {
    const cookie = await viewed(parentCookie, adminId);
    const result = await shared.requireNutritionPrincipal(request('/session', cookie));
    expect(result.principal).toMatchObject({
      householdProfileId: parentId,
      viewedHouseholdProfileId: adminId,
    });
    expect(result.actor?.householdProfileId).toBe(parentId);
    const response = await routes.PATCH(
      request(`/profiles/${adminId}`, cookie, {
        expectedVersion: 1,
        settings: { dailyResetTimezone: 'Europe/London' },
      }),
      { params: Promise.resolve({ profileId: adminId }) },
    );
    expect(response.status).toBe(403);
  });
  it('a child viewing an adult keeps child authority and only sees their own Nutrition profile', async () => {
    const cookie = await viewed(childCookie, adminId);
    const response = await roster.GET(request('/profiles', cookie));
    expect(response.status).toBe(200);
    const profiles = (await response.json()).profiles;
    expect(profiles).toHaveLength(1);
    expect(profiles[0].linkedHouseholdProfileId).toBe(childId);
    const { proxy } = await import('@/proxy');
    expect(
      (
        await proxy(
          new NextRequest(`${origin}/api/v1/nutrition/profiles/${adminId}`, {
            headers: { cookie },
          }),
        )
      ).status,
    ).toBe(403);
    expect(
      (
        await routes.GET(request(`/profiles/${adminId}`, cookie), {
          params: Promise.resolve({ profileId: adminId }),
        })
      ).status,
    ).toBe(403);
  });
  it('preserves explicit guardian management using the account actor', async () => {
    nutrition.setHouseholdGuardianGrant({
      parentHouseholdProfileId: parentId,
      childHouseholdProfileId: childId,
      enabled: true,
    });
    const cookie = await viewed(parentCookie, childId);
    const resolved = await shared.requireNutritionPrincipal(request('/session', cookie));
    const profile = nutrition.getPrivateNutritionProfile(childId, resolved.principal!.id);
    const { proxy } = await import('@/proxy');
    const allowed = await proxy(
      new NextRequest(`${origin}/api/v1/nutrition/profiles/${childId}`, {
        method: 'PATCH',
        headers: { origin, cookie },
      }),
    );
    expect(allowed.status).toBe(200);
    const response = await routes.PATCH(
      request(`/profiles/${childId}`, cookie, {
        expectedVersion: profile.version,
        settings: { dailyResetTimezone: 'Europe/London' },
      }),
      { params: Promise.resolve({ profileId: childId }) },
    );
    expect(response.status).toBe(200);
    expect((await response.json()).profile.dailyResetTimezone).toBe('Europe/London');
  });
  it('rejects a revoked session even with a valid session-bound viewed profile cookie', async () => {
    const cookie = await viewed(parentCookie, adminId);
    const principal = await authentication.getAuthenticatedSessionPrincipal(
      request('/session', cookie),
    );
    database
      .getDatabase()
      .delete(schema.session)
      .where(eq(schema.session.id, principal!.sessionId!))
      .run();
    expect((await sessions.GET(request('/session', cookie))).status).toBe(401);
    expect((await roster.GET(request('/profiles', cookie))).status).toBe(401);
  });
});
