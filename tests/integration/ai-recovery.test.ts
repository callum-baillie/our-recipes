import * as authentication from '@/lib/services/auth-service';
import { POST as resolveRecoveryRoute } from '@/app/api/v1/ai/recovery/[requestId]/route';
import { GET as recoveryInboxRoute } from '@/app/api/v1/ai/recovery/route';
import { randomUUID } from 'node:crypto';
import { eq } from 'drizzle-orm';
import { beforeEach, afterEach, it, expect, vi } from 'vitest';
import { getDatabase, resetDatabaseForTests } from '@/lib/db/client';
import {
  aiRecoveryRequests,
  aiRuntimeSettings,
  user,
  profileAuthLinks,
  aiExecutionTraces,
  aiOperationAudits,
} from '@/lib/db/schema';
import { completeSetup, addProfile } from '@/lib/services/household-service';
import {
  createAiChatThread,
  runAiChatTurn,
  AiChatRateLimitError,
} from '@/lib/services/ai-chat-service';
import { getAiDataPolicy, updateAiSettings } from '@/lib/services/ai-settings-service';
import { getGlobalAiPolicy, getEffectiveAiPolicy } from '@/lib/services/ai-access-service';
import { AiExecutionLimitError } from '@/lib/services/ai-execution-service';
import { aiChatProblem } from '@/lib/services/ai-chat-problem';
import {
  requestAiRecovery,
  resolveAiRecovery,
  claimAiRecoveries,
  listAiRecoveryRequests,
  assertAiRecoveryGrants,
  AiConsentRequiredError,
} from '@/lib/services/ai-recovery-service';
import { withAiExecutionContext } from '@/lib/services/ai-execution-context';
import {
  setAiAssistantProviderForTests,
  type AiAssistantProvider,
} from '@/lib/providers/ai-assistant-provider';
import type { RequestPrincipal } from '@/lib/services/auth-service';

const profileInput = {
  displayName: 'Callum',
  color: '#637A45',
  avatarUrl: '',
  units: 'metric' as const,
  temperatureUnit: 'C' as const,
  locale: 'en-GB',
  timezone: 'UTC',
};
let caller: RequestPrincipal, owner: RequestPrincipal, threadId: string;
function principal(profileId: string, role: 'admin' | 'parent' | 'child'): RequestPrincipal {
  const id = randomUUID();
  getDatabase()
    .insert(user)
    .values({
      id,
      name: role,
      email: `${id}@example.test`,
      role,
      createdAt: new Date(),
      updatedAt: new Date(),
    })
    .run();
  getDatabase()
    .insert(profileAuthLinks)
    .values({ userId: id, profileId, createdAt: new Date(), updatedAt: new Date() })
    .run();
  return {
    kind: 'session',
    userId: id,
    role,
    accountRole: role,
    activeProfileRole: role,
    sessionId: randomUUID(),
    apiKeyId: null,
    linkedProfileId: profileId,
    profileId,
  };
}
beforeEach(() => {
  vi.stubEnv('DATABASE_URL', ':memory:');
  vi.stubEnv('DATA_DIR', '.test-data/ai-recovery');
  resetDatabaseForTests();
  const setup = completeSetup({
    householdName: 'Recovery fixtures',
    appName: 'Bòrd',
    profile: profileInput,
  });
  caller = principal(setup.profiles[0]!.id, 'admin');
  owner = principal(addProfile({ ...profileInput, displayName: 'Julia' }).id, 'parent');
  threadId = createAiChatThread(caller.profileId).id;
});
afterEach(() => {
  setAiAssistantProviderForTests(null);
  resetDatabaseForTests();
  vi.restoreAllMocks();
  vi.unstubAllEnvs();
});
function sharing() {
  return requestAiRecovery(caller, threadId, {
    kind: 'sharing',
    targetProfileId: owner.profileId,
    categories: ['shareIdentity'],
    reason: 'Resolve the named person for dinner planning.',
  });
}
it('only the data owner can approve another account’s private context, even for an admin requester', () => {
  const request = sharing();
  expect(request.canApprove).toBe(false);
  expect(() => resolveAiRecovery(caller, request.id, { decision: 'once' })).toThrow('data owner');
  expect(listAiRecoveryRequests(owner).some((r) => r.id === request.id && r.canApprove)).toBe(true);
  resolveAiRecovery(owner, request.id, { decision: 'once' });
  expect(getAiDataPolicy(owner.profileId).shareIdentity).toBe(false);
  const grants = claimAiRecoveries(caller, threadId, randomUUID(), [request.id]);
  expect(
    withAiExecutionContext(
      { recoveryGrants: grants },
      () => getAiDataPolicy(owner.profileId).shareIdentity,
    ),
  ).toBe(true);
  expect(getAiDataPolicy(owner.profileId).shareIdentity).toBe(false);
  expect(() => claimAiRecoveries(caller, threadId, randomUUID(), [request.id])).toThrow(
    'already used',
  );
});
it('rejects a grant in another conversation or account and rejects replays into another turn', () => {
  const request = sharing();
  resolveAiRecovery(owner, request.id, { decision: 'once' });
  expect(() => claimAiRecoveries(owner, threadId, randomUUID(), [request.id])).toThrow();
  expect(() =>
    claimAiRecoveries(caller, createAiChatThread(caller.profileId).id, randomUUID(), [request.id]),
  ).toThrow();
  const operation = randomUUID();
  expect(claimAiRecoveries(caller, threadId, operation, [request.id])).toHaveLength(1);
  expect(claimAiRecoveries(caller, threadId, operation, [request.id])).toHaveLength(1);
  expect(() => claimAiRecoveries(caller, threadId, randomUUID(), [request.id])).toThrow();
});
it('revoked sharing or expired approvals cannot be used', () => {
  const request = sharing();
  resolveAiRecovery(owner, request.id, { decision: 'once' });
  updateAiSettings(owner.profileId, { dataPolicy: getAiDataPolicy(owner.profileId) });
  expect(() => claimAiRecoveries(caller, threadId, randomUUID(), [request.id])).toThrow(
    'Sharing settings changed',
  );
  const next = requestAiRecovery(caller, threadId, {
    kind: 'sharing',
    targetProfileId: owner.profileId,
    categories: ['shareWeight'],
    reason: 'Use a permitted measurement.',
  });
  getDatabase()
    .update(aiRecoveryRequests)
    .set({ expiresAt: new Date(Date.now() - 1000) })
    .where(eq(aiRecoveryRequests.id, next.id))
    .run();
  expect(() => resolveAiRecovery(owner, next.id, { decision: 'once' })).toThrow('ended');
});
it('permanent consent updates only the selected sharing categories and can be consumed without a transient grant', () => {
  const before = getAiDataPolicy(owner.profileId);
  const request = sharing();
  resolveAiRecovery(owner, request.id, { decision: 'permanent' });
  const after = getAiDataPolicy(owner.profileId);
  expect(after.shareIdentity).toBe(true);
  expect(after.shareWeight).toBe(before.shareWeight);
  expect(after.version).toBe(before.version + 1);
  expect(claimAiRecoveries(caller, threadId, randomUUID(), [request.id])).toEqual([]);
});
it('admin limit overrides are isolated to one reply and leave the persisted policy unchanged', () => {
  const current = getGlobalAiPolicy().settings.generationsPerTenMinutes;
  const request = requestAiRecovery(caller, threadId, {
    kind: 'limit',
    setting: 'generationsPerTenMinutes',
    value: Math.min(100, current + 16),
    reason: 'The current request exceeded the account limit.',
  });
  expect(() => resolveAiRecovery(owner, request.id, { decision: 'once' })).toThrow();
  expect(() =>
    resolveAiRecovery({ ...owner, role: 'admin', accountRole: 'admin' }, request.id, {
      decision: 'once',
    }),
  ).toThrow();
  resolveAiRecovery(caller, request.id, { decision: 'once' });
  const grants = claimAiRecoveries(caller, threadId, randomUUID(), [request.id]);
  expect(
    withAiExecutionContext(
      { recoveryGrants: grants },
      () => getEffectiveAiPolicy(caller.profileId).generationsPerTenMinutes,
    ),
  ).toBe(current + 16);
  expect(getGlobalAiPolicy().settings.generationsPerTenMinutes).toBe(current);
});
it('permanent limit changes use the versioned settings service and preserve unrelated options', () => {
  const before = getGlobalAiPolicy();
  const request = requestAiRecovery(caller, threadId, {
    kind: 'limit',
    setting: 'toolRoundLimit',
    value: 12,
    reason: 'More tool steps are needed.',
  });
  resolveAiRecovery(caller, request.id, { decision: 'permanent' });
  const after = getGlobalAiPolicy();
  expect(after.settings.toolRoundLimit).toBe(12);
  expect(after.settings.maxOutputTokens).toBe(before.settings.maxOutputTokens);
  expect(after.version).toBe(before.version + 1);
});
it('rejects arbitrary categories, excessive values, non-session approval and withdrawn admin authority', () => {
  expect(() =>
    requestAiRecovery(caller, threadId, {
      kind: 'sharing',
      targetProfileId: owner.profileId,
      categories: ['password'],
      reason: 'not allowed',
    }),
  ).toThrow();
  expect(() =>
    requestAiRecovery(caller, threadId, {
      kind: 'limit',
      setting: 'maxOutputTokens',
      value: 999999,
      reason: 'too high',
    }),
  ).toThrow();
  const request = requestAiRecovery(caller, threadId, {
    kind: 'limit',
    setting: 'toolRoundLimit',
    value: 12,
    reason: 'More steps.',
  });
  resolveAiRecovery(caller, request.id, { decision: 'once' });
  principal(addProfile({ ...profileInput, displayName: 'Backup administrator' }).id, 'admin');
  getDatabase().update(user).set({ role: 'parent' }).where(eq(user.id, caller.userId)).run();
  expect(() => claimAiRecoveries(caller, threadId, randomUUID(), [request.id])).toThrow(
    'settings changed',
  );
  expect(() => listAiRecoveryRequests({ ...caller, kind: 'api-key' })).toThrow('Sign in');
});
it('the model can request consent but cannot approve or change a policy', async () => {
  const respond = vi.fn().mockResolvedValue({
    text: '',
    responseItems: [],
    usage: { inputTokens: 1, outputTokens: 1 },
    toolCalls: [
      {
        callId: 'consent',
        name: 'request_ai_access',
        arguments: {
          targetProfileId: owner.profileId,
          categories: ['shareIdentity'],
          reason: 'Resolve a named person.',
        },
      },
    ],
  });
  setAiAssistantProviderForTests({ respond } as unknown as AiAssistantProvider);
  const result = await runAiChatTurn({
    threadId,
    profileId: caller.profileId,
    principal: caller,
    message: { message: 'Plan dinner for Julia.' },
  });
  expect(respond).toHaveBeenCalledOnce();
  expect(result.message.content).toContain('permission');
  expect(getAiDataPolicy(owner.profileId).shareIdentity).toBe(false);
  expect(getDatabase().select().from(aiRecoveryRequests).get()?.status).toBe('pending');
});
it('a one-time consent enables one actual chat reply and blocks later private-history replay until renewed', async () => {
  const request = sharing();
  resolveAiRecovery(owner, request.id, { decision: 'once' });
  const respond = vi.fn(async () => ({
    text: 'Ready to plan.',
    toolCalls: [],
    responseItems: [],
    usage: { inputTokens: 1, outputTokens: 1 },
  }));
  setAiAssistantProviderForTests({ respond } as unknown as AiAssistantProvider);
  await runAiChatTurn({
    threadId,
    profileId: caller.profileId,
    principal: caller,
    message: { message: 'Continue the plan.', recoveryRequestIds: [request.id] },
  });
  expect(respond).toHaveBeenCalledOnce();
  expect(getAiDataPolicy(owner.profileId).shareIdentity).toBe(false);
  await expect(
    runAiChatTurn({
      threadId,
      profileId: caller.profileId,
      principal: caller,
      message: { message: 'Continue again.' },
    }),
  ).rejects.toBeInstanceOf(AiConsentRequiredError);
  expect(respond).toHaveBeenCalledOnce();
});
it('creates a safe actionable budget problem without copying provider input or secrets', () => {
  const problem = aiChatProblem(new AiExecutionLimitError(), { principal: caller, threadId });
  expect(problem.code).toBe('account_request_limit');
  expect(problem.recoveryRequests).toHaveLength(1);
  expect(problem.details).toContain('Reference:');
  expect(problem.details).toContain('Configured limits:');
  const unknown = aiChatProblem(new Error('secret household input'));
  expect(JSON.stringify(unknown)).not.toContain('secret household input');
});
it('a granted retry can cross the old budget and the next unapproved turn is limited again', async () => {
  getDatabase()
    .insert(aiRuntimeSettings)
    .values({ id: 'global', settings: JSON.stringify({ generationsPerTenMinutes: 1 }), version: 1 })
    .run();
  const respond = vi.fn(async () => ({
    text: 'Done.',
    toolCalls: [],
    responseItems: [],
    usage: { inputTokens: 1, outputTokens: 1 },
  }));
  setAiAssistantProviderForTests({ respond } as unknown as AiAssistantProvider);
  await runAiChatTurn({
    threadId,
    profileId: caller.profileId,
    principal: caller,
    message: { message: 'First' },
  });
  const request = aiChatProblem(new AiExecutionLimitError(), { principal: caller, threadId })
    .recoveryRequests[0]!;
  resolveAiRecovery(caller, request.id, { decision: 'once' });
  await runAiChatTurn({
    threadId,
    profileId: caller.profileId,
    principal: caller,
    message: { message: 'Approved reply', recoveryRequestIds: [request.id] },
  });
  expect(getDatabase().select().from(aiExecutionTraces).all()).toHaveLength(2);
  await expect(
    runAiChatTurn({
      threadId,
      profileId: caller.profileId,
      principal: caller,
      message: { message: 'Unapproved' },
    }),
  ).rejects.toBeInstanceOf(AiExecutionLimitError);
  expect(respond).toHaveBeenCalledTimes(2);
  expect(getGlobalAiPolicy().settings.generationsPerTenMinutes).toBe(1);
});

it('offers an administrator approval for the chat-start throttle and scopes it to one reply', async () => {
  getDatabase()
    .insert(aiOperationAudits)
    .values(
      Array.from({ length: 20 }, () => ({
        id: randomUUID(),
        kind: 'assistant-chat' as const,
        status: 'succeeded' as const,
        sourceDigest: 'synthetic',
        sourceLabel: 'Mock chat turn',
        provider: 'Mock',
        model: 'mock',
        profileId: caller.profileId,
        threadId,
        createdAt: new Date(),
      })),
    )
    .run();
  const respond = vi.fn().mockResolvedValue({
    text: 'Done.',
    toolCalls: [],
    responseItems: [],
    usage: { inputTokens: 1, outputTokens: 1 },
  });
  setAiAssistantProviderForTests({ respond } as unknown as AiAssistantProvider);
  const start = (recoveryRequestIds: string[] = []) =>
    runAiChatTurn({
      threadId,
      profileId: caller.profileId,
      principal: caller,
      message: { message: 'Continue', recoveryRequestIds },
    });
  const error = await start().catch((error: unknown) => error);
  expect(error).toBeInstanceOf(AiChatRateLimitError);
  expect(respond).not.toHaveBeenCalled();
  const problem = aiChatProblem(error, { principal: caller, threadId });
  expect(problem.code).toBe('chat_turn_limit');
  expect(problem.details).toContain('Assistant replies started in this window: 20/20');
  const request = problem.recoveryRequests[0]!;
  resolveAiRecovery(caller, request.id, { decision: 'once' });
  await start([request.id]);
  expect(respond).toHaveBeenCalledOnce();
  await expect(start()).rejects.toBeInstanceOf(AiChatRateLimitError);
  expect(getGlobalAiPolicy().settings.generationsPerTenMinutes).toBe(10);
});

it('protects approval mutations with exact trusted origins and checks the signed-in account', async () => {
  const request = sharing();
  vi.spyOn(authentication, 'getAuthenticatedSessionPrincipal').mockResolvedValue(owner);
  const rejected = await resolveRecoveryRoute(
    new Request(`http://localhost:3000/api/v1/ai/recovery/${request.id}`, {
      method: 'POST',
      headers: { Origin: 'http://localhost:3000.evil', 'Content-Type': 'application/json' },
      body: JSON.stringify({ decision: 'permanent' }),
    }),
    { params: Promise.resolve({ requestId: request.id }) },
  );
  expect(rejected.status).toBe(403);
  expect(getAiDataPolicy(owner.profileId).shareIdentity).toBe(false);
  const accepted = await resolveRecoveryRoute(
    new Request(`http://localhost:3000/api/v1/ai/recovery/${request.id}`, {
      method: 'POST',
      headers: { Origin: 'http://localhost:3000', 'Content-Type': 'application/json' },
      body: JSON.stringify({ decision: 'once' }),
    }),
    { params: Promise.resolve({ requestId: request.id }) },
  );
  expect(accepted.status).toBe(200);
  expect(getAiDataPolicy(owner.profileId).shareIdentity).toBe(false);
});
it('keeps foreign requests out of an unrelated account inbox and rejects malformed decisions', async () => {
  const request = sharing();
  const unrelated = principal(addProfile({ ...profileInput, displayName: 'Other' }).id, 'parent');
  expect(listAiRecoveryRequests(unrelated)).toEqual([]);
  vi.spyOn(authentication, 'getAuthenticatedSessionPrincipal').mockResolvedValue(owner);
  const response = await resolveRecoveryRoute(
    new Request(`http://localhost:3000/api/v1/ai/recovery/${request.id}`, {
      method: 'POST',
      headers: { Origin: 'http://localhost:3000', 'Content-Type': 'application/json' },
      body: JSON.stringify({ decision: 'once', targetProfileId: caller.profileId }),
    }),
    { params: Promise.resolve({ requestId: request.id }) },
  );
  expect(response.status).toBe(400);
  expect(getDatabase().select().from(aiRecoveryRequests).get()?.status).toBe('pending');
  vi.mocked(authentication.getAuthenticatedSessionPrincipal).mockResolvedValue(null);
  expect(
    (await recoveryInboxRoute(new Request('http://localhost:3000/api/v1/ai/recovery'))).status,
  ).toBe(401);
});
it('declining leaves data sharing unchanged and child accounts cannot request another member’s private data', () => {
  const request = sharing();
  resolveAiRecovery(owner, request.id, { decision: 'decline' });
  expect(getAiDataPolicy(owner.profileId).shareIdentity).toBe(false);
  const child = principal(addProfile({ ...profileInput, displayName: 'Child' }).id, 'child');
  const childThread = createAiChatThread(child.profileId).id;
  expect(() =>
    requestAiRecovery(child, childThread, {
      kind: 'sharing',
      targetProfileId: owner.profileId,
      categories: ['shareIdentity'],
      reason: 'Not permitted.',
    }),
  ).toThrow('cannot request');
});

it('the data owner can revoke an approval before use and while a reply is running', () => {
  const request = sharing();
  resolveAiRecovery(owner, request.id, { decision: 'once' });
  const grants = claimAiRecoveries(caller, threadId, randomUUID(), [request.id]);
  resolveAiRecovery(owner, request.id, { decision: 'revoke' });
  expect(() =>
    withAiExecutionContext({ recoveryGrants: grants }, () => assertAiRecoveryGrants()),
  ).toThrow('withdrawn');
  expect(getAiDataPolicy(owner.profileId).shareIdentity).toBe(false);
});
it('does not spend one-time consent when a preflight budget check prevents every provider call', async () => {
  getDatabase()
    .insert(aiRuntimeSettings)
    .values({ id: 'global', settings: JSON.stringify({ generationsPerTenMinutes: 1 }), version: 1 })
    .run();
  const respond = vi.fn(async () => ({
    text: 'Done.',
    toolCalls: [],
    responseItems: [],
    usage: { inputTokens: 1, outputTokens: 1 },
  }));
  setAiAssistantProviderForTests({ respond } as unknown as AiAssistantProvider);
  await runAiChatTurn({
    threadId,
    profileId: caller.profileId,
    principal: caller,
    message: { message: 'Fill budget' },
  });
  const request = sharing();
  resolveAiRecovery(owner, request.id, { decision: 'once' });
  await expect(
    runAiChatTurn({
      threadId,
      profileId: caller.profileId,
      principal: caller,
      message: { message: 'Use context', recoveryRequestIds: [request.id] },
    }),
  ).rejects.toBeInstanceOf(AiExecutionLimitError);
  expect(
    getDatabase()
      .select()
      .from(aiRecoveryRequests)
      .where(eq(aiRecoveryRequests.id, request.id))
      .get()?.status,
  ).toBe('approved');
  expect(respond).toHaveBeenCalledOnce();
});

it('revocation aborts an active provider request and records cancellation', async () => {
  const request = sharing();
  resolveAiRecovery(owner, request.id, { decision: 'once' });
  const respond = vi.fn(
    (input: Parameters<AiAssistantProvider['respond']>[0]) =>
      new Promise((_resolve, reject) => {
        input.signal?.addEventListener('abort', () => reject(input.signal?.reason), { once: true });
      }),
  );
  setAiAssistantProviderForTests({ respond } as unknown as AiAssistantProvider);
  const pending = runAiChatTurn({
    threadId,
    profileId: caller.profileId,
    principal: caller,
    message: { message: 'Use the approved context', recoveryRequestIds: [request.id] },
  });
  const outcome = expect(pending).rejects.toThrow('revoked');
  await vi.waitFor(() => expect(respond).toHaveBeenCalledOnce());
  resolveAiRecovery(owner, request.id, { decision: 'revoke' });
  await outcome;
  expect(getDatabase().select().from(aiExecutionTraces).get()?.status).toBe('cancelled');
});
it('an exact concurrent request cannot refund another active reply’s grant during authentication preflight', async () => {
  const request = sharing();
  resolveAiRecovery(owner, request.id, { decision: 'once' });
  let release!: (p: RequestPrincipal) => void;
  const authGate = new Promise<RequestPrincipal>((resolve) => {
    release = resolve;
  });
  vi.spyOn(authentication, 'getAuthenticatedSessionPrincipal').mockImplementation(() => authGate);
  const respond = vi.fn(async () => ({
    text: 'Done',
    toolCalls: [],
    responseItems: [],
    usage: { inputTokens: 1, outputTokens: 1 },
  }));
  setAiAssistantProviderForTests({ respond } as unknown as AiAssistantProvider);
  const operationId = randomUUID();
  const input = {
    threadId,
    profileId: caller.profileId,
    principal: caller,
    request: new Request('http://localhost:3000'),
    message: { operationId, message: 'Use the approved context', recoveryRequestIds: [request.id] },
  };
  const first = runAiChatTurn(input);
  await vi.waitFor(() =>
    expect(authentication.getAuthenticatedSessionPrincipal).toHaveBeenCalled(),
  );
  await expect(runAiChatTurn(input)).rejects.toThrow('already running');
  expect(
    getDatabase()
      .select()
      .from(aiRecoveryRequests)
      .where(eq(aiRecoveryRequests.id, request.id))
      .get()?.status,
  ).toBe('used');
  release(caller);
  await first;
  expect(respond).toHaveBeenCalledOnce();
});

it('keeps human approval labels out of provider input until consent is granted', async () => {
  const respond = vi.fn().mockResolvedValue({
    text: '',
    responseItems: [],
    usage: { inputTokens: 1, outputTokens: 1 },
    toolCalls: [
      {
        callId: 'permission',
        name: 'request_ai_access',
        arguments: {
          targetProfileId: owner.profileId,
          categories: ['shareIdentity'],
          reason: 'Identify a household member.',
        },
      },
    ],
  });
  setAiAssistantProviderForTests({ respond } as unknown as AiAssistantProvider);
  const events: Record<string, unknown>[] = [];
  await runAiChatTurn({
    threadId,
    profileId: caller.profileId,
    principal: caller,
    message: { message: 'Identify household member 2.' },
    onEvent: (e) => events.push(e),
  });
  expect(JSON.stringify(respond.mock.calls[0]?.[0].messages)).not.toContain('Julia');
  expect(JSON.stringify(events.find((e) => e.type === 'recovery_request'))).toContain('Julia');
  expect(respond).toHaveBeenCalledOnce();
});

it('replays an acknowledged approval without applying the settings mutation twice', () => {
  const request = requestAiRecovery(caller, threadId, {
    kind: 'limit',
    setting: 'toolRoundLimit',
    value: 12,
    reason: 'More steps are needed.',
  });
  resolveAiRecovery(caller, request.id, { decision: 'permanent' });
  const version = getGlobalAiPolicy().version;
  expect(resolveAiRecovery(caller, request.id, { decision: 'permanent' }).status).toBe('approved');
  expect(getGlobalAiPolicy().version).toBe(version);
});

it('combines approved limits using the highest scoped value regardless of card order', () => {
  const lower = requestAiRecovery(caller, threadId, {
    kind: 'limit',
    setting: 'toolRoundLimit',
    value: 10,
    reason: 'More steps.',
  });
  const higher = requestAiRecovery(caller, threadId, {
    kind: 'limit',
    setting: 'toolRoundLimit',
    value: 12,
    reason: 'More steps for this task.',
  });
  resolveAiRecovery(caller, lower.id, { decision: 'once' });
  resolveAiRecovery(caller, higher.id, { decision: 'once' });
  const grants = claimAiRecoveries(caller, threadId, randomUUID(), [higher.id, lower.id]);
  expect(
    withAiExecutionContext(
      { recoveryGrants: grants },
      () => getEffectiveAiPolicy(caller.profileId).toolRoundLimit,
    ),
  ).toBe(12);
  expect(getGlobalAiPolicy().settings.toolRoundLimit).toBe(8);
});
