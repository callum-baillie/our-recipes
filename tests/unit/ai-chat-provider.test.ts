import { expect, it, vi } from 'vitest';
import { OpenAiAssistantProvider } from '@/lib/providers/ai-assistant-provider';
const input = {
  model: 'test',
  reasoningEffort: null,
  instructions: 'Test',
  messages: [],
  tools: [],
  safetyIdentifier: 'test',
};
it('requests encrypted reasoning for stateless tool continuations and carries the returned item intact', async () => {
  const reasoning = { type: 'reasoning', encrypted_content: 'opaque-test-value' };
  const create = vi.fn().mockResolvedValue({
    output: [
      reasoning,
      {
        type: 'function_call',
        call_id: 'call-1',
        name: 'read_household_profiles',
        arguments: '{}',
      },
    ],
  });
  const provider = new OpenAiAssistantProvider('unused', { create, parse: vi.fn() });
  const result = await provider.respond(input);
  expect(create).toHaveBeenCalledWith(
    expect.objectContaining({ store: false, include: ['reasoning.encrypted_content'] }),
    expect.anything(),
  );
  expect(result.responseItems[0]).toEqual(reasoning);
  expect(result.toolCalls).toEqual([
    { callId: 'call-1', name: 'read_household_profiles', arguments: {} },
  ]);
});
it('reports actionable quota failures without exposing provider input', async () => {
  const log = vi.spyOn(console, 'warn').mockImplementation(() => {});
  try {
    const provider = new OpenAiAssistantProvider('unused', {
      create: vi.fn().mockRejectedValue({
        status: 429,
        code: 'insufficient_quota',
        message: 'private provider input',
      }),
      parse: vi.fn(),
    });
    await expect(provider.respond(input)).rejects.toThrow('quota');
    expect(JSON.stringify(log.mock.calls)).not.toContain('private provider input');
  } finally {
    log.mockRestore();
  }
});
