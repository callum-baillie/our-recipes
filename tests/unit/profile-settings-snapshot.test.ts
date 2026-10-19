import { afterEach, describe, expect, it, vi } from 'vitest';
const mocks = vi.hoisted(() => ({
  admin: vi.fn(async () => ({ userId: 'admin' })),
  state: vi.fn(() => ({
    profiles: [
      { id: 'a', displayName: 'Avery', archivedAt: null },
      { id: 'b', displayName: 'Rowan', archivedAt: null },
    ],
  })),
  access: vi.fn(() => [
    { profileId: 'a', role: 'admin', isLastAdmin: true },
    { profileId: 'b', role: 'child', isLastAdmin: false },
  ]),
}));
vi.mock('@/lib/services/auth-service', () => ({
  requireAdminSession: mocks.admin,
  listProfileAccessAccounts: mocks.access,
}));
vi.mock('@/lib/services/household-service', () => ({
  getHouseholdState: mocks.state,
  addProfile: vi.fn(),
  ConflictError: class extends Error {},
}));
vi.mock('@/lib/services/nutrition-profile-service', () => ({
  listHouseholdGuardianAssignments: () => [],
}));
vi.mock('@/app/api/v1/admin/api-keys/_shared', () => ({
  adminAuthError: (error: unknown) =>
    error instanceof Error && error.message === 'fixture-denied'
      ? Response.json({ error: { message: 'Admin required' } }, { status: 403 })
      : null,
}));
import { GET } from '@/app/api/v1/profiles/route';
afterEach(() => vi.clearAllMocks());
describe('authoritative member settings snapshot', () => {
  it('returns actual roles and last-admin metadata behind the administrator read guard', async () => {
    const request = new Request('https://bord.test/api/v1/profiles?enriched=true');
    const response = await GET(request);
    expect(mocks.admin).toHaveBeenCalledWith(request, { fresh: false });
    expect((await response.json()).profiles).toMatchObject([
      { id: 'a', role: 'admin', isLastAdmin: true },
      { id: 'b', role: 'child', isLastAdmin: false },
    ]);
  });
  it('does not expose enriched access metadata when the guard fails', async () => {
    mocks.admin.mockRejectedValueOnce(new Error('fixture-denied'));
    expect((await GET(new Request('https://bord.test/api/v1/profiles?enriched=true'))).status).toBe(
      403,
    );
    expect(mocks.access).not.toHaveBeenCalled();
  });
  it('retains the original bare-profile response contract for ordinary callers', async () => {
    const response = await GET(
      new Request('https://bord.test/api/v1/profiles?includeArchived=true'),
    );
    expect(Array.isArray(await response.json())).toBe(true);
    expect(mocks.admin).not.toHaveBeenCalled();
  });
});
