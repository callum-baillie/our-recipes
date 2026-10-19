import { beforeEach, describe, expect, it, vi } from 'vitest';
const mocks = vi.hoisted(() => ({ authorize: vi.fn(), actor: vi.fn(), list: vi.fn() }));
vi.mock('@/lib/api-auth', () => ({
  authorizeCoreApi: mocks.authorize,
  actorFromPrincipal: mocks.actor,
  withApiRequestId: (response: Response) => response,
}));
vi.mock('@/lib/services/cooking-service', () => ({
  listCookHistory: mocks.list,
  startCookSession: vi.fn(),
  CookingNotFoundError: class extends Error {},
}));
vi.mock('@/lib/services/pantry-grocery-cooking-service', () => ({
  getCookSessionPantryPreview: vi.fn(),
}));
import { GET } from '@/app/api/v1/cook-sessions/route';
describe('mobile completed cook history boundary', () => {
  beforeEach(() => {
    vi.resetAllMocks();
    mocks.authorize.mockResolvedValue({ principal: { id: 'account' }, requestId: 'request' });
    mocks.actor.mockReturnValue({ profileId: 'selected-profile' });
    mocks.list.mockReturnValue([{ id: 'completed-session' }]);
  });
  it('uses the authorized actor and returns uncached history', async () => {
    const response = await GET(
      new Request('http://localhost/api/v1/cook-sessions?profileId=untrusted'),
    );
    expect(response.status).toBe(200);
    expect(mocks.list).toHaveBeenCalledWith('selected-profile');
    expect(response.headers.get('cache-control')).toBe('no-store');
    expect(await response.json()).toEqual({ sessions: [{ id: 'completed-session' }] });
  });
  it('does not read history after authorization rejects the request', async () => {
    mocks.authorize.mockResolvedValue({ response: new Response(null, { status: 401 }) });
    expect((await GET(new Request('http://localhost/api/v1/cook-sessions'))).status).toBe(401);
    expect(mocks.list).not.toHaveBeenCalled();
  });
  it('requires an actor before selecting history', async () => {
    mocks.actor.mockReturnValue({ profileId: null });
    expect((await GET(new Request('http://localhost/api/v1/cook-sessions'))).status).toBe(409);
    expect(mocks.list).not.toHaveBeenCalled();
  });
});
