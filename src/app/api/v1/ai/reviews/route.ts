import { personalAiPrincipal } from '@/lib/services/ai-personal-request';
import { decisionErrorResponse } from '@/lib/services/decision-request-service';
import { NextResponse } from 'next/server';

import { aiReviewActionSchema } from '@/lib/domain/ai';
import { hasTrustedMutationOrigin, jsonError } from '@/lib/http';
import { AiOperationError, createAiReviewCandidate } from '@/lib/services/ai-operation-service';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

function aiError(error: AiOperationError) {
  const status =
    error.code === 'rate_limited' ? 429 : error.code === 'ai_not_configured' ? 503 : 422;
  return jsonError(status, error.code, error.message);
}

export async function POST(request: Request) {
  if (!hasTrustedMutationOrigin(request)) {
    return jsonError(
      403,
      'untrusted_origin',
      'This OpenAI action must come from a trusted app origin.',
    );
  }
  let principal;
  try {
    principal = await personalAiPrincipal(request);
  } catch (error) {
    return decisionErrorResponse(error);
  }
  const parsed = aiReviewActionSchema.safeParse(await request.json().catch(() => null));
  if (!parsed.success) {
    return jsonError(400, 'invalid_ai_review', 'Choose a valid, bounded recipe source for review.');
  }
  try {
    const created = await createAiReviewCandidate({
      actorProfileId: principal.linkedProfileId,
      action: parsed.data,
    });
    return NextResponse.json(
      {
        candidate: created.candidate,
        audit: {
          id: created.audit.id,
          kind: created.audit.kind,
          status: created.audit.status,
          createdAt: created.audit.createdAt,
        },
      },
      { headers: { 'Cache-Control': 'no-store', 'X-Content-Type-Options': 'nosniff' } },
    );
  } catch (error) {
    if (error instanceof AiOperationError) return aiError(error);
    throw error;
  }
}
