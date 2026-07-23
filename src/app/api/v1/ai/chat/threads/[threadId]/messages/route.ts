import { cookies } from 'next/headers';
import { ZodError } from 'zod';

import { ACTIVE_PROFILE_COOKIE, getActorContext } from '@/lib/actor-context';
import { hasTrustedMutationOrigin, jsonError } from '@/lib/http';
import {
  AiAssistantProviderResponseError,
  AiAssistantProviderUnavailableError,
} from '@/lib/providers/ai-assistant-provider';
import {
  AiChatForbiddenError,
  AiChatNotFoundError,
  AiChatRateLimitError,
  runAiChatTurn,
} from '@/lib/services/ai-chat-service';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

export async function POST(request: Request, context: { params: Promise<{ threadId: string }> }) {
  if (!hasTrustedMutationOrigin(request))
    return jsonError(403, 'untrusted_origin', 'This change must come from a trusted app origin.');
  const profileId = getActorContext((await cookies()).get(ACTIVE_PROFILE_COOKIE)?.value).profileId;
  if (!profileId)
    return jsonError(409, 'profile_selection_required', 'Choose a household profile first.');
  try {
    const result = await runAiChatTurn({
      threadId: (await context.params).threadId,
      profileId,
      message: await request.json().catch(() => null),
    });
    const encoder = new TextEncoder();
    const events = [
      { type: 'status', message: 'Complete' },
      { type: 'text', delta: result.message.content },
      ...result.actions.map((action) => ({
        type: 'action',
        actionId: action.id,
        kind: action.kind,
        preview: action.preview,
      })),
      { type: 'done', messageId: result.message.id, actionId: result.message.actionId },
    ];
    return new Response(
      new ReadableStream({
        start(controller) {
          for (const event of events)
            controller.enqueue(encoder.encode(`${JSON.stringify(event)}\n`));
          controller.close();
        },
      }),
      {
        headers: {
          'Content-Type': 'application/x-ndjson; charset=utf-8',
          'Cache-Control': 'no-store',
          'X-Content-Type-Options': 'nosniff',
        },
      },
    );
  } catch (error) {
    if (error instanceof ZodError)
      return jsonError(400, 'invalid_message', 'Enter a valid message.');
    if (error instanceof AiChatNotFoundError)
      return jsonError(404, 'thread_not_found', error.message);
    if (error instanceof AiChatForbiddenError)
      return jsonError(403, 'thread_forbidden', error.message);
    if (error instanceof AiChatRateLimitError) return jsonError(429, 'rate_limited', error.message);
    if (error instanceof AiAssistantProviderUnavailableError)
      return jsonError(503, 'ai_not_configured', error.message);
    if (error instanceof AiAssistantProviderResponseError)
      return jsonError(502, 'ai_request_failed', error.message);
    throw error;
  }
}
