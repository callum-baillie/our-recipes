import { personalAiPrincipal } from '@/lib/services/ai-personal-request';
import { AiRecoveryError, resolveAiRecovery } from '@/lib/services/ai-recovery-service';
import {
  boundedDecisionJson,
  decisionErrorResponse,
} from '@/lib/services/decision-request-service';
import { jsonError } from '@/lib/http';
import { z } from 'zod';
export const runtime = 'nodejs';
export async function POST(request: Request, context: { params: Promise<{ requestId: string }> }) {
  try {
    const principal = await personalAiPrincipal(request, false);
    const id = z
      .string()
      .uuid()
      .parse((await context.params).requestId);
    return Response.json(
      { request: resolveAiRecovery(principal, id, await boundedDecisionJson(request)) },
      { headers: { 'Cache-Control': 'private, no-store' } },
    );
  } catch (error) {
    if (error instanceof AiRecoveryError)
      return jsonError(403, 'approval_not_allowed', error.message);
    return decisionErrorResponse(error);
  }
}
