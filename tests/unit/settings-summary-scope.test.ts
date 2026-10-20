import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
const mocks = vi.hoisted(() => ({
  principal: vi.fn(),
  allowed: vi.fn(() => true),
  refresh: vi.fn(async () => []),
  unavailable: vi.fn(() => 'disabled_workload'),
}));
vi.mock('@/lib/services/ai-access-service', () => ({ canAccountUseAi: mocks.allowed }));
vi.mock('@/lib/services/auth-service', () => ({
  getAuthenticatedSessionPrincipal: mocks.principal,
}));
vi.mock('@/lib/services/household-service', () => ({
  getHouseholdState: () => ({
    profiles: [
      { id: 'owned-person', displayName: 'Account owner' },
      { id: 'viewed-person', displayName: 'Viewed person' },
    ],
  }),
}));
vi.mock('@/lib/services/ai-summary-service', () => ({
  refreshAiSummaryBundle: mocks.refresh,
  aiSummaryUnavailableReason: mocks.unavailable,
  aiSummaryAvailability: () => [],
  listAiSummaries: vi.fn(() => []),
  AiSummaryInProgressError: class extends Error {},
}));
vi.mock('@/lib/http', () => ({
  hasTrustedMutationOrigin: (request: Request) =>
    request.headers.get('origin') === 'https://bord.test',
  jsonError: (status: number, code: string, message: string) =>
    Response.json({ error: { code, message } }, { status }),
}));
import { GET, POST } from '@/app/api/v1/ai/summaries/route';
beforeEach(() => {
  mocks.principal.mockResolvedValue({
    linkedProfileId: 'owned-person',
    profileId: 'owned-person',
    userId: 'account-1',
    role: 'parent',
    accountRole: 'parent',
  });
  mocks.allowed.mockReturnValue(true);
});
afterEach(() => vi.clearAllMocks());
function request(scope = '') {
  return new Request(`https://bord.test/api/v1/ai/summaries${scope}`, {
    method: 'POST',
    headers: { origin: 'https://bord.test' },
  });
}
describe('summary recipient and outcome', () => {
  it('updates the linked account recipient rather than the viewed household profile', async () => {
    const response = await POST(request('?scope=account'));
    expect(mocks.refresh).toHaveBeenCalledWith('owned-person');
    expect(await response.json()).toMatchObject({
      recipient: { id: 'owned-person', name: 'Account owner' },
      outcome: 'disabled_workload',
    });
  });
  it('default refresh keeps the signed-in recipient when another household person is viewed', async () => {
    mocks.principal.mockResolvedValue({
      linkedProfileId: 'owned-person',
      profileId: 'viewed-person',
      userId: 'account-1',
      role: 'parent',
      accountRole: 'parent',
    });
    await POST(request());
    expect(mocks.refresh).toHaveBeenCalledWith('owned-person');
    expect((await GET(new Request('https://bord.test/api/v1/ai/summaries'))).status).toBe(403);
  });
  it('rejects signed-out direct calls and disabled-account generation', async () => {
    mocks.principal.mockResolvedValue(null);
    expect((await GET(new Request('https://bord.test/api/v1/ai/summaries'))).status).toBe(401);
    expect((await POST(request())).status).toBe(401);
    mocks.principal.mockResolvedValue({
      linkedProfileId: 'owned-person',
      profileId: 'owned-person',
      userId: 'account-1',
      role: 'parent',
      accountRole: 'parent',
    });
    mocks.allowed.mockReturnValue(false);
    expect((await POST(request())).status).toBe(403);
    expect(mocks.refresh).not.toHaveBeenCalled();
  });
  it('allows only bounded, private reads for the authenticated recipient', async () => {
    const response = await GET(new Request('https://bord.test/api/v1/ai/summaries?limit=12'));
    expect(response.status).toBe(200);
    expect(response.headers.get('cache-control')).toBe('private, no-store');
    expect((await GET(new Request('https://bord.test/api/v1/ai/summaries?limit=99'))).status).toBe(
      400,
    );
  });
  it('rejects unsupported recipient selection and lookalike origins before any generation', async () => {
    expect((await POST(request('?scope=another-person'))).status).toBe(400);
    expect(
      (
        await POST(
          new Request('https://bord.test/api/v1/ai/summaries?scope=account', {
            method: 'POST',
            headers: { origin: 'https://bord.test.attacker.invalid' },
          }),
        )
      ).status,
    ).toBe(403);
    expect(mocks.refresh).not.toHaveBeenCalled();
  });
});
