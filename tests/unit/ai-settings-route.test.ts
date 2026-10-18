import { afterEach, describe, expect, it, vi } from 'vitest';
const mocks = vi.hoisted(() => ({
  principal: {
    userId: 'signed-in-user',
    profileId: 'switchable-profile',
    linkedProfileId: 'owned-profile',
  },
  read: vi.fn(() => ({})),
  save: vi.fn(() => ({})),
  admin: vi.fn(),
  global: vi.fn(() => ({})),
}));
vi.mock('@/lib/services/auth-service', () => ({
  getAuthenticatedSessionPrincipal: async () => mocks.principal,
  requireAdminSession: mocks.admin,
  RequestAuthError: class extends Error {
    status = 403;
    code = 'admin_required';
  },
}));
vi.mock('@/lib/services/ai-settings-service', () => ({
  getPersonalAiSettings: mocks.read,
  savePersonalAiSettings: mocks.save,
  getGlobalAiSettings: mocks.global,
  saveGlobalAiSettings: vi.fn(),
  AiSettingsConflictError: class extends Error {},
  AiSettingsValidationError: class extends Error {},
}));
vi.mock('@/lib/http', () => ({
  hasTrustedMutationOrigin: (request: Request) =>
    request.headers.get('origin') === 'https://bord.test',
  jsonError: (status: number, code: string, message: string) =>
    Response.json({ error: { code, message } }, { status }),
}));
import { GET, PATCH } from '@/app/api/v1/ai/settings/route';
import { RequestAuthError } from '@/lib/services/auth-service';
afterEach(() => vi.clearAllMocks());
describe('AI settings authentication boundary', () => {
  it('always reads settings for the signed-in account and linked profile', async () => {
    expect((await GET(new Request('https://bord.test/api/v1/ai/settings'))).status).toBe(200);
    expect(mocks.read).toHaveBeenCalledWith('signed-in-user', 'owned-profile');
  });
  it('writes personal settings independently of a switchable profile', async () => {
    const response = await PATCH(
      new Request('https://bord.test/api/v1/ai/settings', {
        method: 'PATCH',
        headers: { origin: 'https://bord.test', 'content-type': 'application/json' },
        body: '{}',
      }),
    );
    expect(response.status).toBe(200);
    expect(mocks.save).toHaveBeenCalledWith('signed-in-user', 'owned-profile', {});
  });
  it('requires administrator authentication for global reads and writes', async () => {
    mocks.admin.mockRejectedValue(
      new RequestAuthError(403, 'admin_required', 'Administrator required'),
    );
    expect(
      (await GET(new Request('https://bord.test/api/v1/ai/settings?scope=global'))).status,
    ).toBe(403);
    expect(mocks.global).not.toHaveBeenCalled();
    expect(mocks.read).not.toHaveBeenCalled();
  });
  it('rejects lookalike mutation origins before accessing settings', async () => {
    const response = await PATCH(
      new Request('https://bord.test/api/v1/ai/settings', {
        method: 'PATCH',
        headers: { origin: 'https://bord.test.attacker.example' },
        body: '{}',
      }),
    );
    expect(response.status).toBe(403);
    expect(mocks.save).not.toHaveBeenCalled();
  });
});
