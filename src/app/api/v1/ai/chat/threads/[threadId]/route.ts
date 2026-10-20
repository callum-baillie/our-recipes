import { personalAiPrincipal } from '@/lib/services/ai-personal-request';
import { decisionErrorResponse } from '@/lib/services/decision-request-service';
import { DecisionError } from '@/lib/providers/decisions-provider';
import { NextResponse } from 'next/server';

import { hasTrustedMutationOrigin, jsonError } from '@/lib/http';
import { listAiActionProposals } from '@/lib/services/ai-action-service';
import { listAiJobs } from '@/lib/services/ai-job-service';
import {
  AiChatForbiddenError,
  AiChatNotFoundError,
  deleteAiChatThread,
  getAiChatMessages,
  getAiChatTurnStates,
} from '@/lib/services/ai-chat-service';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

export async function GET(request: Request, context: { params: Promise<{ threadId: string }> }) {
  try {
    const principal = await personalAiPrincipal(request, false);
    const profileId = principal.linkedProfileId;
    const threadId = (await context.params).threadId;
    return NextResponse.json(
      {
        messages: getAiChatMessages(threadId, profileId),
        turns: getAiChatTurnStates(threadId, profileId, principal.userId),
        actions: listAiActionProposals(threadId, profileId),
        jobs: listAiJobs({ profileId, threadId }),
      },
      { headers: { 'Cache-Control': 'private, no-store' } },
    );
  } catch (error) {
    if (error instanceof AiChatNotFoundError)
      return jsonError(404, 'thread_not_found', error.message);
    if (error instanceof AiChatForbiddenError)
      return jsonError(403, 'thread_forbidden', error.message);
    if (error instanceof DecisionError) return decisionErrorResponse(error);
    throw error;
  }
}

export async function DELETE(request: Request, context: { params: Promise<{ threadId: string }> }) {
  if (!hasTrustedMutationOrigin(request))
    return jsonError(403, 'untrusted_origin', 'This change must come from a trusted app origin.');
  try {
    const { linkedProfileId: profileId } = await personalAiPrincipal(request, false);
    deleteAiChatThread((await context.params).threadId, profileId);
    return new NextResponse(null, { status: 204 });
  } catch (error) {
    if (error instanceof AiChatNotFoundError)
      return jsonError(404, 'thread_not_found', error.message);
    if (error instanceof AiChatForbiddenError)
      return jsonError(403, 'thread_forbidden', error.message);
    if (error instanceof DecisionError) return decisionErrorResponse(error);
    throw error;
  }
}
