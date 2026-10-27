import { NextResponse } from 'next/server';

import { onboardingInterviewRequestSchema } from '@/lib/domain/onboarding-interview';
import { hasTrustedMutationOrigin, jsonError } from '@/lib/http';
import { canAccountUseAi } from '@/lib/services/ai-access-service';
import { getAiReadiness } from '@/lib/services/ai-readiness-service';
import { RequestAuthError, requireAdminSession } from '@/lib/services/auth-service';
import { getHouseholdState } from '@/lib/services/household-service';
import {
  OnboardingInterviewRateLimitError,
  OnboardingInterviewUnavailableError,
  runOnboardingInterviewTurn,
} from '@/lib/services/onboarding-interview-service';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

const headers = { 'Cache-Control': 'no-store', 'X-Content-Type-Options': 'nosniff' };

/**
 * One conversational turn of the onboarding interview. Before the kitchen exists there is
 * nobody to sign in as, so the route is open but small, rate limited, and accepts only the
 * narrow food-question payload. After setup it needs the household admin (who is the only
 * person who can add profiles) with AI access.
 */
export async function POST(request: Request) {
  if (!hasTrustedMutationOrigin(request)) {
    return jsonError(403, 'untrusted_origin', 'This change must come from a trusted app origin.');
  }
  if (!getAiReadiness().enabled) {
    return jsonError(503, 'ai_unavailable', 'The assistant is not available. Carry on without it.');
  }
  const input = onboardingInterviewRequestSchema.safeParse(await request.json().catch(() => null));
  if (!input.success) return jsonError(400, 'invalid_request', 'That answer could not be sent.');

  try {
    let subject: Parameters<typeof runOnboardingInterviewTurn>[1] = { kind: 'setup' };
    if (getHouseholdState().household) {
      const principal = await requireAdminSession(request, { fresh: false });
      if (!canAccountUseAi(principal.userId)) {
        return jsonError(403, 'ai_disabled', 'AI is disabled for your account.');
      }
      subject = { kind: 'account', userId: principal.userId };
    }
    const turn = await runOnboardingInterviewTurn(input.data, subject);
    return NextResponse.json({ turn }, { headers });
  } catch (error) {
    if (error instanceof RequestAuthError)
      return jsonError(error.status, error.code, error.message);
    if (error instanceof OnboardingInterviewRateLimitError)
      return jsonError(429, 'rate_limited', error.message);
    if (error instanceof OnboardingInterviewUnavailableError)
      return jsonError(502, 'ai_unavailable', error.message);
    throw error;
  }
}
