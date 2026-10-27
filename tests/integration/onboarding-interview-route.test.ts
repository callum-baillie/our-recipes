import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

const mocks = vi.hoisted(() => ({
  household: null as unknown,
  admin: vi.fn(),
  aiEnabled: true,
  respond: vi.fn(),
}));

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
  requireAdminSession: mocks.admin,
  RequestAuthError: class RequestAuthError extends Error {
    constructor(
      readonly status: number,
      readonly code: string,
      message: string,
    ) {
      super(message);
    }
  },
}));
vi.mock('@/lib/services/ai-access-service', () => ({ canAccountUseAi: () => true }));
vi.mock('@/lib/services/ai-readiness-service', () => ({
  getAiReadiness: () => ({ enabled: mocks.aiEnabled }),
}));
vi.mock('@/lib/providers/ai-assistant-provider', () => ({
  getAiAssistantProvider: () => ({ respond: mocks.respond }),
}));

import { POST } from '@/app/api/v1/setup/interview/route';
import { resetOnboardingInterviewLimitsForTests } from '@/lib/services/onboarding-interview-service';

const body = {
  topic: 'taste',
  question: 'Do you lean sweet, savory, or a little of both?',
  answer: 'A little of both. Email me at avery@example.test',
  history: [],
  remaining: ['snacks'],
  focusAreas: [],
  dietary: { preferences: [], allergies: ['Peanuts'], exclusions: [] },
  followUpsUsed: 0,
};

const request = (payload: unknown, origin = 'http://localhost:3000') =>
  new Request('http://localhost:3000/api/v1/setup/interview', {
    method: 'POST',
    headers: { origin, 'content-type': 'application/json' },
    body: JSON.stringify(payload),
  });

const toolTurn = {
  text: '',
  toolCalls: [
    {
      callId: 'call-1',
      name: 'reply_to_interview_answer',
      arguments: {
        reply: 'A balance, lovely.',
        followUp: {
          question: 'Which snacks do you reach for?',
          suggestions: ['Fruit', 'Crackers'],
        },
        noted: [{ topic: 'snacks', value: 'Fruit' }],
      },
    },
  ],
  usage: { inputTokens: 1, outputTokens: 1 },
  responseItems: [],
};

describe('onboarding interview route', () => {
  beforeEach(() => {
    mocks.household = null;
    mocks.aiEnabled = true;
    mocks.respond.mockReset();
    mocks.admin.mockReset();
    resetOnboardingInterviewLimitsForTests();
  });
  afterEach(() => vi.clearAllMocks());

  it('answers before setup with only redacted, allow-listed content sent to the provider', async () => {
    mocks.respond.mockResolvedValue(toolTurn);
    const response = await POST(request(body));
    expect(response.status).toBe(200);
    expect((await response.json()).turn).toMatchObject({
      reply: 'A balance, lovely.',
      noted: [{ topic: 'snacks', value: 'Fruit' }],
    });
    const sent = JSON.stringify(mocks.respond.mock.calls[0]![0].messages);
    expect(sent).not.toContain('avery@example.test');
    expect(sent).toContain('Peanuts');
    expect(mocks.admin).not.toHaveBeenCalled();
  });

  it('falls back to the model’s prose when it skips the tool call', async () => {
    mocks.respond.mockResolvedValue({ ...toolTurn, text: 'Nice mix of flavors.', toolCalls: [] });
    const response = await POST(request(body));
    expect((await response.json()).turn).toEqual({
      reply: 'Nice mix of flavors.',
      followUp: null,
      noted: [],
    });
  });

  it('rejects untrusted origins and unexpected fields without calling the provider', async () => {
    expect((await POST(request(body, 'https://untrusted.example.test'))).status).toBe(403);
    expect((await POST(request({ ...body, passphrase: 'secret-value' }))).status).toBe(400);
    expect(mocks.respond).not.toHaveBeenCalled();
  });

  it('is unavailable when AI is not configured and reports provider failures plainly', async () => {
    mocks.aiEnabled = false;
    expect((await POST(request(body))).status).toBe(503);
    mocks.aiEnabled = true;
    mocks.respond.mockRejectedValue(new Error('upstream detail that must not leak'));
    const failed = await POST(request(body));
    expect(failed.status).toBe(502);
    expect(JSON.stringify(await failed.json())).not.toContain('upstream detail');
  });

  it('requires the household admin once the kitchen exists', async () => {
    mocks.household = { id: 'household-1' };
    const { RequestAuthError } = await import('@/lib/services/auth-service');
    mocks.admin.mockRejectedValue(new RequestAuthError(401, 'authentication_required', 'Sign in.'));
    expect((await POST(request(body))).status).toBe(401);
    expect(mocks.respond).not.toHaveBeenCalled();
    mocks.admin.mockResolvedValue({ userId: 'user-1' });
    mocks.respond.mockResolvedValue(toolTurn);
    expect((await POST(request(body))).status).toBe(200);
  });
});
