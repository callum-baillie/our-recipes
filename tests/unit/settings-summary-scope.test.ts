import { afterEach, describe, expect, it, vi } from 'vitest';
const mocks = vi.hoisted(() => ({
  principal: vi.fn(async () => ({ linkedProfileId: 'owned-person' })),
  refresh: vi.fn(async () => []),
  unavailable: vi.fn(() => 'disabled_workload'),
}));
vi.mock('next/headers', () => ({
  cookies: async () => ({ get: () => ({ value: 'signed-view' }) }),
}));
vi.mock('@/lib/actor-context', () => ({
  ACTIVE_PROFILE_COOKIE: 'profile',
  getActorContext: () => ({ profileId: 'viewed-person' }),
}));
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
  listAiSummaries: vi.fn(() => []),
  AiSummaryInProgressError: class extends Error {},
}));
vi.mock('@/lib/http', () => ({
  hasTrustedMutationOrigin: (request: Request) =>
    request.headers.get('origin') === 'https://bord.test',
  jsonError: (status: number, code: string, message: string) =>
    Response.json({ error: { code, message } }, { status }),
}));
import { POST } from '@/app/api/v1/ai/summaries/route';
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
  it('preserves the existing explicitly active-profile consumer', async () => {
    await POST(request());
    expect(mocks.refresh).toHaveBeenCalledWith('viewed-person');
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
