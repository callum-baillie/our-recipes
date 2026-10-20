import { describe, expect, it, vi } from 'vitest';
import { readNdjson } from '@/lib/client/ndjson-stream';
import { OpenAiAssistantProvider } from '@/lib/providers/ai-assistant-provider';

const input = {
  model: 'gpt-4o',
  reasoningEffort: null,
  instructions: 'Test fixture',
  messages: [],
  tools: [],
  safetyIdentifier: 'synthetic',
};
describe('progressive assistant transport', () => {
  it('decodes fragmented UTF-8 and the final line without a newline', async () => {
    const bytes = new TextEncoder().encode('{"text":"Bòrd 🥣"}\n{"done":true}');
    const stream = new ReadableStream<Uint8Array>({
      start(c) {
        for (const byte of bytes) c.enqueue(new Uint8Array([byte]));
        c.close();
      },
    });
    const values = [];
    for await (const event of readNdjson(stream)) values.push(event);
    expect(values).toEqual([{ text: 'Bòrd 🥣' }, { done: true }]);
  });
  it('releases a pending reader when explicitly stopped', async () => {
    const abort = new AbortController();
    const cancel = vi.fn();
    const stream = new ReadableStream<Uint8Array>({ cancel });
    const iterator = readNdjson(stream, abort.signal);
    const next = iterator.next();
    abort.abort();
    await expect(next).rejects.toThrow();
    expect(cancel).toHaveBeenCalledOnce();
  });
  it('delivers provider text while the final response is still pending', async () => {
    let finish!: () => void;
    const finished = new Promise<void>((resolve) => {
      finish = resolve;
    });
    const stream = Object.assign(
      (async function* () {
        yield { type: 'response.output_text.delta', delta: 'Hello' };
        await finished;
        yield { type: 'response.output_text.delta', delta: ' kitchen' };
      })(),
      {
        finalResponse: async () => ({
          status: 'completed',
          output_text: 'Hello kitchen',
          output: [],
          usage: { input_tokens: 3, output_tokens: 2 },
        }),
      },
    );
    const client = { stream: vi.fn(() => stream), create: vi.fn(), parse: vi.fn() };
    const provider = new OpenAiAssistantProvider('dummy-never-used', client);
    const delta = vi.fn();
    let complete = false;
    const request = provider.respond({ ...input, onTextDelta: delta }).then((value) => {
      complete = true;
      return value;
    });
    await vi.waitFor(() => expect(delta).toHaveBeenCalledWith('Hello'));
    expect(complete).toBe(false);
    finish();
    expect((await request).text).toBe('Hello kitchen');
    expect(client.create).not.toHaveBeenCalled();
  });
  it('rejects an incomplete terminal response instead of acknowledging it', async () => {
    const stream = Object.assign(
      (async function* () {
        yield { type: 'response.output_text.delta', delta: 'Partial' };
      })(),
      { finalResponse: async () => ({ status: 'incomplete', output_text: 'Partial' }) },
    );
    const provider = new OpenAiAssistantProvider('dummy-never-used', {
      stream: () => stream,
      create: vi.fn(),
      parse: vi.fn(),
    });
    await expect(provider.respond(input)).rejects.toThrow('before completion');
  });
});
