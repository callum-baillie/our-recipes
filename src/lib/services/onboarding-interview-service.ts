import 'server-only';

import { createHmac } from 'node:crypto';

import { getRuntimeConfig } from '@/lib/config';
import { AI_WORKLOAD_DEFAULTS } from '@/lib/domain/ai-assistant';
import {
  interviewUserMessage,
  ONBOARDING_INTERVIEW_INSTRUCTIONS,
  ONBOARDING_INTERVIEW_TOOL,
  onboardingInterviewTurnSchema,
  redactSensitiveText,
  sanitizeInterviewTurn,
  type OnboardingInterviewRequest,
  type OnboardingInterviewTurn,
} from '@/lib/domain/onboarding-interview';
import { getAiAssistantProvider } from '@/lib/providers/ai-assistant-provider';

export class OnboardingInterviewRateLimitError extends Error {}
export class OnboardingInterviewUnavailableError extends Error {}

const WINDOW_MS = 60 * 60 * 1_000;
/** Before setup finishes there is no account to bill, so the whole instance shares one small budget. */
const SETUP_LIMIT = 80;
const ACCOUNT_LIMIT = 120;
const hits = new Map<string, number[]>();

function takeRateLimitSlot(subject: string, limit: number, now = Date.now()): void {
  const recent = (hits.get(subject) ?? []).filter((time) => now - time < WINDOW_MS);
  if (recent.length >= limit) {
    hits.set(subject, recent);
    throw new OnboardingInterviewRateLimitError(
      'You have chatted a lot this hour. Carry on without the assistant for now.',
    );
  }
  recent.push(now);
  hits.set(subject, recent);
}

export function resetOnboardingInterviewLimitsForTests(): void {
  hits.clear();
}

/**
 * Produces the assistant's reply to one onboarding answer. The request has already been
 * validated against the narrow allow-list schema; free text is redacted again here so a
 * modified client cannot send an email address or a "my password is …" line either.
 */
export async function runOnboardingInterviewTurn(
  request: OnboardingInterviewRequest,
  subject: { kind: 'setup' } | { kind: 'account'; userId: string },
): Promise<OnboardingInterviewTurn> {
  if (subject.kind === 'setup') takeRateLimitSlot('setup', SETUP_LIMIT);
  else takeRateLimitSlot(`account:${subject.userId}`, ACCOUNT_LIMIT);

  const safe: OnboardingInterviewRequest = {
    ...request,
    question: redactSensitiveText(request.question),
    answer: redactSensitiveText(request.answer),
    history: request.history.map((entry) => ({
      ...entry,
      question: redactSensitiveText(entry.question),
      answer: redactSensitiveText(entry.answer),
    })),
  };

  const defaults = AI_WORKLOAD_DEFAULTS.chat;
  const safetyIdentifier = createHmac('sha256', getRuntimeConfig().cookieSecret)
    .update(`openai-safety:onboarding:${subject.kind === 'setup' ? 'setup' : subject.userId}`)
    .digest('base64url')
    .slice(0, 64);

  let result;
  try {
    result = await getAiAssistantProvider().respond({
      model: defaults.model,
      reasoningEffort: 'low',
      instructions: ONBOARDING_INTERVIEW_INSTRUCTIONS,
      messages: [{ role: 'user', content: interviewUserMessage(safe) }],
      tools: [ONBOARDING_INTERVIEW_TOOL as never],
      safetyIdentifier,
      maxOutputTokens: 1_200,
      requestTimeoutSeconds: 25,
    });
  } catch {
    throw new OnboardingInterviewUnavailableError('The assistant could not reply just now.');
  }

  const call = result.toolCalls.find((item) => item.name === ONBOARDING_INTERVIEW_TOOL.name);
  const parsed = onboardingInterviewTurnSchema.safeParse(call?.arguments);
  if (parsed.success) return sanitizeInterviewTurn(parsed.data, safe);

  // The model answered in prose instead of calling the tool: keep the kind words, drop everything else.
  const prose = redactSensitiveText(result.text).slice(0, 400);
  if (!prose)
    throw new OnboardingInterviewUnavailableError('The assistant could not reply just now.');
  return { reply: prose, followUp: null, noted: [] };
}
