import { afterEach, describe, expect, it } from 'vitest';
import { readNdjson } from '../../shared/mobile-domain/ndjson';
import {
  initialChatStream,
  reduceChatStream,
  reviewedTurnOutcome,
  type ChatStreamEvent,
} from '../../shared/mobile-domain/chat-stream';
import {
  clearAssistantDrafts,
  readAssistantDraft,
  retainAssistantDraft,
} from '../src/data/assistant-drafts';

const encoder = new TextEncoder();
afterEach(clearAssistantDrafts);
describe('native progressive assistant responses', () => {
  it('exposes provider text before the network stream completes, including split UTF-8 and final buffered event', async () => {
    let controller!: ReadableStreamDefaultController<Uint8Array>;
    const stream = new ReadableStream<Uint8Array>({
      start(value) {
        controller = value;
      },
    });
    const events = readNdjson<ChatStreamEvent>(stream);
    let state = { ...initialChatStream };
    const text = encoder.encode('{"type":"text","sequence":1,"delta":"Crème"}\n');
    const split = text.indexOf(0xc3) + 1;
    controller.enqueue(text.slice(0, split));
    const first = events.next();
    controller.enqueue(text.slice(split));
    state = reduceChatStream(state, (await first).value!);
    expect(state.text).toBe('Crème');
    expect(state.completed).toBe(false);
    controller.enqueue(
      encoder.encode('{"type":"done","sequence":2,"content":"Crème brûlée","messageId":"saved"}'),
    );
    controller.close();
    state = reduceChatStream(state, (await events.next()).value!);
    expect(state).toMatchObject({ completed: true, text: 'Crème brûlée', messageId: 'saved' });
    expect((await events.next()).done).toBe(true);
  });
  it('ignores duplicates, rejects missed events and replaces tentative text only on an observed reset', () => {
    const first = reduceChatStream(initialChatStream, { type: 'text', sequence: 1, delta: 'A' });
    expect(reduceChatStream(first, { type: 'text', sequence: 1, delta: 'A' })).toBe(first);
    expect(() => reduceChatStream(first, { type: 'text', sequence: 3, delta: 'C' })).toThrow(
      'lost',
    );
    const reset = reduceChatStream(first, { type: 'text_reset', sequence: 2 });
    expect(reset.text).toBe('');
    expect(() =>
      reduceChatStream(reset, { type: 'error', sequence: 3, message: 'Provider unavailable' }),
    ).toThrow('Provider unavailable');
    expect(reset.completed).toBe(false);
  });
  it('aborts an in-flight reader without inventing completion', async () => {
    let cancelled = false;
    const stream = new ReadableStream<Uint8Array>({
      cancel() {
        cancelled = true;
      },
    });
    const abort = new AbortController();
    const pending = readNdjson(stream, abort.signal).next();
    abort.abort();
    await expect(pending).rejects.toMatchObject({ name: 'AbortError' });
    expect(cancelled).toBe(true);
  });
  it('keeps an uncertain submitted command separate from the next draft and isolates accounts and conversations', () => {
    const operation = {
      operationId: 'stable-operation',
      threadId: 'a',
      message: 'Original request',
      attachments: [],
    };
    retainAssistantDraft('server:account:a', {
      message: 'My next message',
      attachments: [],
      turn: operation,
    });
    retainAssistantDraft('server:account:b', { message: 'Different conversation' });
    const restored = readAssistantDraft<{ message: string; turn: typeof operation }>(
      'server:account:a',
    )!;
    expect(restored.message).toBe('My next message');
    expect(restored.turn).toEqual(operation);
    expect(readAssistantDraft('server:other-account:a')).toBeUndefined();
    clearAssistantDrafts();
    expect(readAssistantDraft('server:account:a')).toBeUndefined();
  });
});

it('rehydrates server-owned running turns without treating an old timestamp as completion', () => {
  expect(reviewedTurnOutcome([{ id: 'remote', status: 'running' }])).toEqual({
    terminal: null,
    blocked: true,
  });
  expect(reviewedTurnOutcome([{ id: 'own', status: 'completed' }], 'own')).toEqual({
    terminal: 'completed',
    blocked: false,
  });
  expect(reviewedTurnOutcome([], 'uncertain')).toEqual({ terminal: null, blocked: true });
  expect(
    reviewedTurnOutcome(
      [
        { id: 'own', status: 'cancelled' },
        { id: 'other', status: 'running' },
      ],
      'own',
    ),
  ).toEqual({ terminal: 'cancelled', blocked: true });
});
