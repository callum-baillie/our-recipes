import { beforeEach, afterEach, describe, it, expect, vi } from 'vitest';
vi.mock('server-only', () => ({}));
const mocks = vi.hoisted(() => ({ principal: vi.fn(), read: vi.fn(), update: vi.fn() }));
vi.mock('@/lib/services/auth-service', () => ({
  getAuthenticatedSessionPrincipal: mocks.principal,
}));
vi.mock('@/lib/services/kitchen-context-service', () => ({
  readKitchenContext: mocks.read,
  updateKitchenContext: mocks.update,
}));
import { GET, PATCH } from '@/app/api/v1/account/kitchen-context/route';
describe('own kitchen context route', () => {
  beforeEach(() => {
    vi.stubEnv('APP_ORIGIN', 'http://localhost:3000');
    vi.clearAllMocks();
    mocks.principal.mockResolvedValue({
      linkedProfileId: 'own-profile',
      profileId: 'selected-other-profile',
    });
    mocks.read.mockReturnValue({ interview: null, revision: 'revision' });
    mocks.update.mockReturnValue({ interview: {}, revision: 'next' });
  });
  afterEach(() => vi.unstubAllEnvs());
  it('reads the authenticated account’s own context despite a different selected profile', async () => {
    const response = await GET(new Request('http://localhost:3000/api/v1/account/kitchen-context'));
    expect(response.status).toBe(200);
    expect(mocks.read).toHaveBeenCalledWith('own-profile');
  });
  it('requires a signed-in account', async () => {
    mocks.principal.mockResolvedValue(null);
    expect(
      (await GET(new Request('http://localhost:3000/api/v1/account/kitchen-context'))).status,
    ).toBe(401);
    expect(mocks.read).not.toHaveBeenCalled();
  });
  it('rejects an untrusted mutation origin before updating', async () => {
    const response = await PATCH(
      new Request('http://localhost:3000/api/v1/account/kitchen-context', {
        method: 'PATCH',
        headers: { origin: 'https://untrusted.example' },
        body: '{}',
      }),
    );
    expect(response.status).toBe(403);
    expect(mocks.update).not.toHaveBeenCalled();
  });
  it('updates only the account-owned context', async () => {
    const response = await PATCH(
      new Request('http://localhost:3000/api/v1/account/kitchen-context', {
        method: 'PATCH',
        headers: { origin: 'http://localhost:3000' },
        body: '{}',
      }),
    );
    expect(response.status).toBe(200);
    expect(mocks.update).toHaveBeenCalledWith('own-profile', {});
  });
});
