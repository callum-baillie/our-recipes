import { cookies } from 'next/headers';
import { NextResponse } from 'next/server';

import { ACTIVE_PROFILE_COOKIE, getActorContext } from '@/lib/actor-context';
import { hasTrustedMutationOrigin, jsonError } from '@/lib/http';
import { listAiActionProposals } from '@/lib/services/ai-action-service';
import {
  AiChatForbiddenError,
  AiChatNotFoundError,
  deleteAiChatThread,
  getAiChatMessages,
} from '@/lib/services/ai-chat-service';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

async function actorProfileId() {
  return getActorContext((await cookies()).get(ACTIVE_PROFILE_COOKIE)?.value).profileId;
}

export async function GET(_request: Request, context: { params: Promise<{ threadId: string }> }) {
  const profileId = await actorProfileId();
  if (!profileId)
    return jsonError(409, 'profile_selection_required', 'Choose a household profile first.');
  try {
    const threadId = (await context.params).threadId;
    return NextResponse.json({
      messages: getAiChatMessages(threadId, profileId),
      actions: listAiActionProposals(threadId, profileId),
    });
  } catch (error) {
    if (error instanceof AiChatNotFoundError)
      return jsonError(404, 'thread_not_found', error.message);
    if (error instanceof AiChatForbiddenError)
      return jsonError(403, 'thread_forbidden', error.message);
    throw error;
  }
}

export async function DELETE(request: Request, context: { params: Promise<{ threadId: string }> }) {
  if (!hasTrustedMutationOrigin(request))
    return jsonError(403, 'untrusted_origin', 'This change must come from a trusted app origin.');
  const profileId = await actorProfileId();
  if (!profileId)
    return jsonError(409, 'profile_selection_required', 'Choose a household profile first.');
  try {
    deleteAiChatThread((await context.params).threadId, profileId);
    return new NextResponse(null, { status: 204 });
  } catch (error) {
    if (error instanceof AiChatNotFoundError)
      return jsonError(404, 'thread_not_found', error.message);
    if (error instanceof AiChatForbiddenError)
      return jsonError(403, 'thread_forbidden', error.message);
    throw error;
  }
}
