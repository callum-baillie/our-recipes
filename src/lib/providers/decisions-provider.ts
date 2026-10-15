import 'server-only';
import { z } from 'zod';
import { getOpenAiApiKey } from '@/lib/providers/openai-key';

export class DecisionError extends Error {
  constructor(
    message: string,
    public status = 400,
  ) {
    super(message);
  }
}
const probability = z.number().finite().min(0).max(1);
const answerSchema = z.discriminatedUnion('type', [
  z.object({
    type: z.literal('choice'),
    name: z.string().nullable(),
    choice: z.string(),
    confidence: probability,
    probabilities: z.array(z.object({ value: z.string(), probability })),
  }),
  z.object({ type: z.literal('refusal'), name: z.string().nullable() }),
]);
export type DecisionQuestion = {
  name: string;
  instructions: string;
  choices: { value: string; description: string }[];
};
export async function requestDecisions(input: {
  evidence: unknown;
  questions: DecisionQuestion[];
  safetyIdentifier: string;
  allowPaidCall: boolean;
}) {
  if (!input.allowPaidCall)
    throw new DecisionError('Confirm the paid AI request before continuing.', 403);
  const key = getOpenAiApiKey();
  if (!key) throw new DecisionError('Configure an OpenAI API key in the server environment.', 503);
  let response: Response;
  try {
    response = await fetch('https://api.openai.com/v1/decisions', {
      method: 'POST',
      redirect: 'error',
      signal: AbortSignal.timeout(60_000),
      headers: { Authorization: `Bearer ${key}`, 'Content-Type': 'application/json' },
      body: JSON.stringify({
        model: 'gpt-6-luna',
        safety_identifier: input.safetyIdentifier,
        input: JSON.stringify(input.evidence),
        questions: input.questions.map((q) => ({ ...q, type: 'choice' })),
      }),
    });
  } catch {
    throw new DecisionError('OpenAI could not be reached. Your records have not changed.', 503);
  }
  if (!response.ok)
    throw new DecisionError(
      response.status === 429
        ? 'OpenAI is busy or its quota was reached. Try again later.'
        : 'OpenAI could not complete this decision request.',
      503,
    );
  const parsed = z
    .object({ answers: z.array(answerSchema).max(200) })
    .safeParse(await response.json().catch(() => null));
  if (!parsed.success || parsed.data.answers.length !== input.questions.length)
    throw new DecisionError('OpenAI returned an incomplete decision. Try again later.', 502);
  return parsed.data.answers;
}
