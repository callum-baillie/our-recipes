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
it('normalizes strict tool schemas to OpenAI-supported JSON Schema keywords', async () => {
  const tools = [
    {
      type: 'function' as const,
      name: 'ask_clarification',
      description: 'Ask a concise question.',
      strict: true as const,
      parameters: {
        $schema: 'https://json-schema.org/draft/2020-12/schema',
        type: 'object',
        properties: {
          question: { type: 'string', minLength: 1, maxLength: 500 },
          hasAnswer: { type: 'boolean', const: false },
        },
        required: ['question', 'hasAnswer'],
        additionalProperties: false,
      },
    },
  ];
  const create = vi.fn().mockResolvedValue({ output: [] });
  const provider = new OpenAiAssistantProvider('unused', { create, parse: vi.fn() });

  await provider.respond({ ...input, tools });

  const request = create.mock.calls[0]?.[0] as {
    tools: Array<{ parameters: Record<string, unknown> }>;
  };
  expect(request.tools[0]?.parameters).toEqual({
    type: 'object',
    properties: {
      question: { type: 'string' },
      hasAnswer: { type: 'boolean', enum: [false] },
    },
    required: ['question', 'hasAnswer'],
    additionalProperties: false,
  });
  expect(tools[0]?.parameters.properties.question).toHaveProperty('maxLength', 500);
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
it('logs a bounded parameter path for request rejection without provider input', async () => {
  const log = vi.spyOn(console, 'warn').mockImplementation(() => {});
  try {
    const provider = new OpenAiAssistantProvider('unused', {
      create: vi.fn().mockRejectedValue({
        status: 400,
        code: 'unknown_parameter',
        param: 'tools[0].parameters.properties.question.maxLength',
        message: 'private provider input',
      }),
      parse: vi.fn(),
    });
    await expect(provider.respond(input)).rejects.toThrow('rejected the chat request');
    expect(log.mock.calls).toContainEqual([
      'Bord chat provider failure',
      expect.objectContaining({
        status: 400,
        code: 'unknown_parameter',
        param: 'tools[0].parameters.properties.question.maxLength',
      }),
    ]);
    expect(JSON.stringify(log.mock.calls)).not.toContain('private provider input');
  } finally {
    log.mockRestore();
  }
});

it('replays streamed tool calls without SDK parsing fields and preserves reasoning and tool results', async () => {
  const reasoning = { type: 'reasoning', encrypted_content: 'opaque-test-value', summary: [] };
  const call = {
    type: 'function_call',
    call_id: 'call-1',
    name: 'read_household_profiles',
    arguments: '{}',
    parsed_arguments: {},
  };
  const message = {
    type: 'message',
    role: 'assistant',
    content: [{ type: 'output_text', text: 'Checking profiles.', annotations: [], parsed: null }],
  };
  const stream = vi.fn().mockImplementation(() => ({
    async *[Symbol.asyncIterator]() {
      yield { type: 'response.output_text.delta', delta: 'Checking profiles.' };
    },
    finalResponse: async () => ({ status: 'completed', output: [reasoning, message, call] }),
  }));
  const provider = new OpenAiAssistantProvider('unused', {
    stream,
    create: vi.fn(),
    parse: vi.fn(),
  });
  const first = await provider.respond(input);
  const toolResult = {
    type: 'function_call_output',
    call_id: 'call-1',
    output: '{"parsed_arguments":"household data"}',
  };
  await provider.respond({ ...input, messages: [...first.responseItems, toolResult] });
  // Also normalize older unsanitized items supplied by a caller.
  await provider.respond({ ...input, messages: [reasoning, message, call, toolResult] });
  const expected = [
    reasoning,
    { ...message, content: [{ type: 'output_text', text: 'Checking profiles.', annotations: [] }] },
    { type: 'function_call', call_id: 'call-1', name: 'read_household_profiles', arguments: '{}' },
    toolResult,
  ];
  expect(stream.mock.calls[1]?.[0].input).toEqual(expected);
  expect(stream.mock.calls[2]?.[0].input).toEqual(expected);
  expect(call.parsed_arguments).toEqual({});
  expect(message.content[0]?.parsed).toBeNull();
});
