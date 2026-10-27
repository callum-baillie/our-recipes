import { NextRequest } from 'next/server';
import { beforeEach, describe, expect, it, vi } from 'vitest';

const mocks = vi.hoisted(() => ({ household: null as unknown, configured: false }));

vi.mock('@/lib/config', () => ({
  getRuntimeConfig: () => ({
    appOrigin: 'http://localhost:3000',
    trustedOrigins: [],
    cookieSecret: 'test-cookie-secret-test-cookie-secret',
  }),
}));
vi.mock('@/lib/services/household-service', () => ({
  getHouseholdState: () => ({ household: mocks.household, profiles: [] }),
}));
vi.mock('@/lib/services/auth-service', () => ({
  isAuthenticationConfigured: () => mocks.configured,
  getAuthenticatedSessionPrincipal: async () => null,
}));
vi.mock('@/lib/services/ai-access-service', () => ({ canAccountUseAi: () => true }));

import { proxy } from '@/proxy';

const call = (path: string, init?: ConstructorParameters<typeof NextRequest>[1]) =>
  proxy(new NextRequest(`http://localhost:3000${path}`, init));
const location = (response: Response) => {
  const header = response.headers.get('location');
  return header ? new URL(header).pathname : null;
};

describe('first-run routing', () => {
  beforeEach(() => {
    mocks.household = null;
    mocks.configured = false;
  });

  it.each([
    '/sign-in',
    '/forgot-password',
    '/reset-password',
    '/verify-email',
    '/security-upgrade',
    '/recipes',
    '/planner',
    '/settings/profiles',
    '/recipes/abc/cook',
  ])('sends %s to setup when no kitchen exists', async (path) => {
    const response = await call(path);
    expect(response.status).toBe(307);
    expect(location(response)).toBe('/');
  });

  it('keeps the old callback and any stale cookies from leaking into the setup redirect', async () => {
    const response = await call('/sign-in?callbackUrl=%2Frecipes%2F123&setup=1', {
      headers: { cookie: 'better-auth.session_token=stale; bord_active_profile=gone' },
    });
    expect(location(response)).toBe('/');
    expect(new URL(response.headers.get('location')!).search).toBe('');
  });

  it('never redirects setup itself, so the redirect cannot loop', async () => {
    for (const path of ['/', '/api/v1/setup', '/api/v1/setup/vesync', '/api/v1/setup/interview']) {
      const response = await call(path, { method: path === '/' ? 'GET' : 'POST' });
      expect(response.headers.get('location')).toBeNull();
    }
  });

  it('answers other API calls with setup_required instead of a redirect', async () => {
    const response = await call('/api/v1/recipes');
    expect(response.status).toBe(503);
    expect((await response.json()).error.code).toBe('setup_required');
  });

  it('serves the sign-in page normally once a kitchen and accounts exist', async () => {
    mocks.household = { id: 'household-1' };
    mocks.configured = true;
    const response = await call('/sign-in');
    expect(response.headers.get('location')).toBeNull();
    expect(response.status).toBe(200);
  });

  it('still routes an existing kitchen without accounts to the security upgrade', async () => {
    mocks.household = { id: 'household-1' };
    expect(location(await call('/recipes'))).toBe('/security-upgrade');
  });
});
