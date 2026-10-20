import { randomUUID } from 'node:crypto';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { getDatabase, resetDatabaseForTests } from '@/lib/db/client';
import { aiChatMessages, aiChatTurns } from '@/lib/db/schema';
import { completeSetup } from '@/lib/services/household-service';
import { createAiChatThread, runAiChatTurn } from '@/lib/services/ai-chat-service';
import {
  setAiAssistantProviderForTests,
  type AiAssistantProvider,
} from '@/lib/providers/ai-assistant-provider';

beforeEach(() => {
  vi.stubEnv('DATABASE_URL', ':memory:');
  vi.stubEnv('DATA_DIR', '.test-data/chat-recovery');
  resetDatabaseForTests();
});
afterEach(() => {
  setAiAssistantProviderForTests(null);
  resetDatabaseForTests();
  vi.unstubAllEnvs();
});
function context() {
  const profile = completeSetup({
    householdName: 'Fixture kitchen',
    appName: 'Bòrd',
    profile: {
      displayName: 'Alex',
      color: '#637A45',
      avatarUrl: '',
      units: 'metric',
      temperatureUnit: 'C',
      locale: 'en-GB',
      timezone: 'Europe/London',
    },
  }).profiles[0]!;
  return {
    profileId: profile.id,
    threadId: createAiChatThread(profile.id).id,
    message: { operationId: randomUUID(), message: 'What can I cook?' },
  };
}
const result = {
  text: 'Review your saved recipes.',
  toolCalls: [],
  responseItems: [],
  usage: { inputTokens: 1, outputTokens: 1 },
};
describe('durable chat request ownership', () => {
  it('replays a completed exact request during provider outage without another message or call', async () => {
    const respond = vi.fn(async (input: Parameters<AiAssistantProvider['respond']>[0]) => {
      input.onTextDelta?.('Review ');
      input.onTextDelta?.('your saved recipes.');
      return result;
    });
    setAiAssistantProviderForTests({ respond } as unknown as AiAssistantProvider);
    const input = context();
    const events: Record<string, unknown>[] = [];
    const first = await runAiChatTurn({ ...input, onEvent: (event) => events.push(event) });
    expect(events.some((event) => event.type === 'text' && event.delta === 'Review ')).toBe(true);
    setAiAssistantProviderForTests({
      respond: () => {
        throw new Error('outage');
      },
    } as unknown as AiAssistantProvider);
    const replay = await runAiChatTurn(input);
    expect(replay.message.id).toBe(first.message.id);
    expect(respond).toHaveBeenCalledOnce();
    expect(getDatabase().select().from(aiChatMessages).all()).toHaveLength(2);
  });
  it('rejects changed intent and concurrent exact submissions', async () => {
    let release!: () => void;
    const gate = new Promise<void>((resolve) => {
      release = resolve;
    });
    const respond = vi.fn(async () => {
      await gate;
      return result;
    });
    setAiAssistantProviderForTests({ respond } as unknown as AiAssistantProvider);
    const input = context();
    const pending = runAiChatTurn(input);
    await vi.waitFor(() => expect(respond).toHaveBeenCalledOnce());
    await expect(runAiChatTurn(input)).rejects.toThrow('already running');
    await expect(
      runAiChatTurn({ ...input, message: { ...input.message, message: 'Different request' } }),
    ).rejects.toThrow('different conversation or message');
    release();
    await pending;
  });
  it('records cancellation and refuses to automatically repeat it', async () => {
    const abort = new AbortController();
    setAiAssistantProviderForTests({
      respond: async () => {
        abort.abort();
        return result;
      },
    } as unknown as AiAssistantProvider);
    const input = context();
    await expect(runAiChatTurn({ ...input, signal: abort.signal })).rejects.toThrow();
    expect(getDatabase().select().from(aiChatTurns).get()?.status).toBe('cancelled');
    await expect(runAiChatTurn(input)).rejects.toThrow('attempt ended');
  });
});
