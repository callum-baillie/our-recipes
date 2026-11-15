import { afterEach, expect, it, vi } from 'vitest';
vi.mock('server-only', () => ({}));
const key = vi.hoisted(() => ({ value: 'mock-key-not-a-credential' as string | null }));
vi.mock('@/lib/providers/openai-key', () => ({ getOpenAiApiKey: () => key.value }));
import { requestDecisions } from '@/lib/providers/decisions-provider';
const input = {
  evidence: { stock: 'unknown' },
  questions: [
    {
      name: 'stock',
      instructions: 'Return unknown.',
      choices: [{ value: 'unknown', description: 'Insufficient evidence' }],
    },
  ],
  safetyIdentifier: 'fixture',
  allowPaidCall: true,
};
afterEach(() => {
  vi.unstubAllGlobals();
  key.value = 'mock-key-not-a-credential';
});
it('requires explicit paid permission and a credential before any network request', async () => {
  const fetch = vi.fn();
  vi.stubGlobal('fetch', fetch);
  await expect(requestDecisions({ ...input, allowPaidCall: false })).rejects.toThrow(
    'paid AI request',
  );
  key.value = null;
  await expect(requestDecisions(input)).rejects.toThrow('API key');
  expect(fetch).not.toHaveBeenCalled();
});
it('preserves unknown probability distributions and handles refusal without guessing', async () => {
  const answer = {
    type: 'choice',
    name: 'stock',
    choice: 'unknown',
    confidence: 0.9,
    probabilities: [{ value: 'unknown', probability: 0.9 }],
  };
  const fetch = vi
    .fn()
    .mockResolvedValueOnce(Response.json({ answers: [answer] }))
    .mockResolvedValueOnce(Response.json({ answers: [{ type: 'refusal', name: 'stock' }] }));
  vi.stubGlobal('fetch', fetch);
  expect(await requestDecisions(input)).toEqual([answer]);
  expect(await requestDecisions(input)).toEqual([{ type: 'refusal', name: 'stock' }]);
});
it('rejects malformed probabilities and incomplete answers', async () => {
  vi.stubGlobal('fetch', vi.fn().mockResolvedValue(Response.json({ answers: [] })));
  await expect(requestDecisions(input)).rejects.toThrow('incomplete decision');
});
