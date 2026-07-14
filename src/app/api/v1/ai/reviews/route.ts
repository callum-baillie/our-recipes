import { cookies } from 'next/headers';
import { NextResponse } from 'next/server';

import { ACTIVE_PROFILE_COOKIE, getActorContext } from '@/lib/actor-context';
import { aiReviewActionSchema } from '@/lib/domain/ai';
import { hasTrustedMutationOrigin, jsonError } from '@/lib/http';
import { AiOperationError, createAiReviewCandidate } from '@/lib/services/ai-operation-service';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

function profileRequired() {
  return jsonError(
    409,
    'profile_selection_required',
    'Choose a household profile before using OpenAI for a review draft.',
  );
}

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
  const actor = getActorContext((await cookies()).get(ACTIVE_PROFILE_COOKIE)?.value);
  if (!actor.profileId) return profileRequired();
  const parsed = aiReviewActionSchema.safeParse(await request.json().catch(() => null));
  if (!parsed.success) {
    return jsonError(400, 'invalid_ai_review', 'Choose a valid, bounded recipe source for review.');
  }
  try {
    const created = await createAiReviewCandidate({
      actorProfileId: actor.profileId,
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
