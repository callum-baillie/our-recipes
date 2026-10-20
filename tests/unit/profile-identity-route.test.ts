import { describe, expect, it, vi, beforeEach } from 'vitest';
const mocks = vi.hoisted(() => ({
  principal: vi.fn(),
  update: vi.fn((id, input) => ({ id, ...input })),
}));
vi.mock('next/headers', () => ({ cookies: async () => ({ get: () => undefined }) }));
vi.mock('@/lib/actor-context', () => ({
  ACTIVE_PROFILE_COOKIE: 'active',
  getActorContext: () => ({ profileId: 'viewed' }),
}));
vi.mock('@/lib/services/auth-service', () => ({
  getAuthenticatedSessionPrincipal: mocks.principal,
  countActiveAdmins: () => 2,
  getProfileAccessRole: () => 'parent',
}));
vi.mock('@/lib/services/household-service', () => ({
  updateProfile: mocks.update,
  setProfileArchived: vi.fn(),
  NotFoundError: class extends Error {},
  ConflictError: class extends Error {},
}));
vi.mock('@/lib/http', () => ({
  hasTrustedMutationOrigin: (request: Request) =>
    request.headers.get('origin') === 'https://bord.test',
  jsonError: (status: number, code: string, message: string) =>
    Response.json({ error: { code, message } }, { status }),
}));
import { PATCH, POST } from '@/app/api/v1/profiles/[profileId]/route';
import { defaultProfileInput } from '@/lib/domain/setup';
const call = (body: object) =>
  PATCH(
    new Request('https://bord.test/api/v1/profiles/other', {
      method: 'PATCH',
      headers: { origin: 'https://bord.test' },
      body: JSON.stringify(body),
    }),
    { params: Promise.resolve({ profileId: 'other' }) },
  );
beforeEach(() => {
  vi.clearAllMocks();
  mocks.principal.mockResolvedValue({
    linkedProfileId: 'owner',
    profileId: 'owner',
    role: 'admin',
  });
});
describe('personal versus identity update contract', () => {
  it('rejects signed-out and non-admin direct identity and archive requests', async () => {
    const archive = () =>
      POST(
        new Request('https://bord.test/api/v1/profiles/other', {
          method: 'POST',
          headers: { origin: 'https://bord.test' },
          body: JSON.stringify({ archived: true }),
        }),
        { params: Promise.resolve({ profileId: 'other' }) },
      );
    mocks.principal.mockResolvedValue(null);
    expect((await call({ scope: 'identity', displayName: 'Other', color: '#637A45' })).status).toBe(
      401,
    );
    expect((await archive()).status).toBe(401);
    mocks.principal.mockResolvedValue({
      linkedProfileId: 'owner',
      profileId: 'owner',
      role: 'parent',
    });
    expect((await call({ scope: 'identity', displayName: 'Other', color: '#637A45' })).status).toBe(
      403,
    );
    expect((await archive()).status).toBe(403);
    expect(mocks.update).not.toHaveBeenCalled();
  });
  it('rejects a stale full snapshot targeting somebody else', async () => {
    const response = await call({ ...defaultProfileInput, displayName: 'Other' });
    expect(response.status).toBe(403);
    expect((await response.json()).error.code).toBe('personal_profile_scope');
    expect(mocks.update).not.toHaveBeenCalled();
  });
  it('accepts the strict identity-only operation without personal fields', async () => {
    expect((await call({ scope: 'identity', displayName: 'Other', color: '#637A45' })).status).toBe(
      200,
    );
    expect(mocks.update.mock.calls[0]?.[1]).toEqual({
      scope: 'identity',
      displayName: 'Other',
      color: '#637A45',
    });
    expect(
      (await call({ scope: 'identity', displayName: 'Other', color: '#637A45', units: 'metric' }))
        .status,
    ).toBe(400);
  });
  it('preserves the owner full-update contract', async () => {
    mocks.principal.mockResolvedValue({
      linkedProfileId: 'other',
      profileId: 'other',
      role: 'admin',
    });
    expect((await call({ ...defaultProfileInput, displayName: 'Other' })).status).toBe(200);
  });
});
