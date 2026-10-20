import { personalAiPrincipal } from '@/lib/services/ai-personal-request';
import { decisionErrorResponse } from '@/lib/services/decision-request-service';
import { NextResponse } from 'next/server';
import { ZodError } from 'zod';

import { hasTrustedMutationOrigin, jsonError } from '@/lib/http';
import {
  AiAssistantProviderResponseError,
  AiAssistantProviderUnavailableError,
} from '@/lib/providers/ai-assistant-provider';
import {
  AiMealPlanValidationError,
  generateAiMealPlanProposal,
} from '@/lib/services/ai-meal-plan-service';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

export async function POST(request: Request) {
  if (!hasTrustedMutationOrigin(request))
    return jsonError(403, 'untrusted_origin', 'This change must come from a trusted app origin.');
  let principal;
  try {
    principal = await personalAiPrincipal(request);
  } catch (error) {
    return decisionErrorResponse(error);
  }
  try {
    const result = await generateAiMealPlanProposal({
      actorProfileId: principal.linkedProfileId,
      request: await request.json().catch(() => null),
    });
    return NextResponse.json({ proposal: result.proposal }, { status: 201 });
  } catch (error) {
    if (error instanceof ZodError || error instanceof AiMealPlanValidationError)
      return jsonError(400, 'invalid_ai_meal_plan', error.message);
    if (error instanceof AiAssistantProviderUnavailableError)
      return jsonError(503, 'ai_not_configured', error.message);
    if (error instanceof AiAssistantProviderResponseError)
      return jsonError(502, 'ai_request_failed', error.message);
    throw error;
  }
}
