import { beforeEach, describe, expect, it, vi } from 'vitest';
const state = vi.hoisted(() => ({ principal: vi.fn(), read: vi.fn(), save: vi.fn() }));
vi.mock('@/lib/services/auth-service', () => ({
  getAuthenticatedSessionPrincipal: state.principal,
}));
vi.mock('@/lib/services/household-service', () => ({
  readPersonalProfile: state.read,
  updatePersonalProfile: state.save,
  ConflictError: class extends Error {},
  NotFoundError: class extends Error {},
}));
vi.mock('@/lib/http', () => ({
  hasTrustedMutationOrigin: (request: Request) =>
    request.headers.get('origin') === 'https://bord.test',
  jsonError: (status: number, code: string, message: string) =>
    Response.json({ error: { code, message } }, { status }),
}));
import { GET, PATCH } from '@/app/api/v1/account/profile/route';
import { ConflictError } from '@/lib/services/household-service';
import { defaultProfileInput, personalProfileValues } from '@/lib/domain/setup';
const settings = personalProfileValues({ ...defaultProfileInput, displayName: 'Avery' });
const call = (body: object, origin = 'https://bord.test') =>
  PATCH(
    new Request('https://bord.test/api/v1/account/profile', {
      method: 'PATCH',
      headers: { origin },
      body: JSON.stringify(body),
    }),
  );
beforeEach(() => {
  vi.clearAllMocks();
  state.principal.mockResolvedValue({ linkedProfileId: 'owner', profileId: 'viewed-child' });
  state.read.mockReturnValue({ profile: { id: 'owner' }, revision: 'a'.repeat(64) });
  state.save.mockReturnValue({ profile: { id: 'owner' }, revision: 'b'.repeat(64) });
});
describe('linked-account personal profile contract', () => {
  it('authenticates read/write, retains exact origin check and never retargets the viewed household person', async () => {
    expect((await GET(new Request('https://bord.test/api/v1/account/profile'))).status).toBe(200);
    expect(state.read).toHaveBeenCalledWith('owner');
    expect((await call({ expectedRevision: 'a'.repeat(64), settings })).status).toBe(200);
    expect(state.save).toHaveBeenCalledWith('owner', {
      expectedRevision: 'a'.repeat(64),
      settings,
    });
    expect(
      (await call({ expectedRevision: 'a'.repeat(64), settings }, 'https://other.test')).status,
    ).toBe(403);
    state.principal.mockResolvedValue(null);
    expect((await GET(new Request('https://bord.test/api/v1/account/profile'))).status).toBe(401);
    expect((await call({ expectedRevision: 'a'.repeat(64), settings })).status).toBe(401);
  });
  it('requires a scoped baseline, rejects questionnaire injection and reports conflict without writing again', async () => {
    expect((await call(settings)).status).toBe(400);
    expect(
      (
        await call({
          expectedRevision: 'a'.repeat(64),
          settings: {
            ...settings,
            goalContext: { ...settings.goalContext, kitchenInterview: { taste: 'old' } },
          },
        })
      ).status,
    ).toBe(400);
    expect(state.save).not.toHaveBeenCalled();
    state.save.mockImplementation(() => {
      throw new ConflictError('Changed');
    });
    const result = await call({ expectedRevision: 'a'.repeat(64), settings });
    expect(result.status).toBe(409);
    expect(await result.json()).toMatchObject({ error: { code: 'profile_conflict' } });
  });
});
