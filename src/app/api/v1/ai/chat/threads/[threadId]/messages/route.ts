import { getEffectiveAiPolicy } from '@/lib/services/ai-access-service';
import {
  decisionErrorResponse,
  boundedDecisionJson,
} from '@/lib/services/decision-request-service';
import { DecisionError } from '@/lib/providers/decisions-provider';
import { personalAiPrincipal } from '@/lib/services/ai-personal-request';
import { ZodError } from 'zod';

import { hasTrustedMutationOrigin, jsonError } from '@/lib/http';
import {
  AiAssistantProviderResponseError,
  AiAssistantProviderUnavailableError,
} from '@/lib/providers/ai-assistant-provider';
import {
  AiChatForbiddenError,
  AiChatNotFoundError,
  AiChatRateLimitError,
  AiChatToolError,
  runAiChatTurn,
  validateAiChatTurn,
} from '@/lib/services/ai-chat-service';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

export async function POST(request: Request, context: { params: Promise<{ threadId: string }> }) {
  if (!hasTrustedMutationOrigin(request))
    return jsonError(403, 'untrusted_origin', 'This change must come from a trusted app origin.');
  try {
    const principal = await personalAiPrincipal(request);
    const profileId = principal.linkedProfileId;
    const input = {
      principal,
      request,
      threadId: (await context.params).threadId,
      profileId,
      message: await boundedDecisionJson(request, 13_000_000),
    };
    validateAiChatTurn(input);
    const abort = new AbortController();
    const signal = AbortSignal.any([
      request.signal,
      abort.signal,
      AbortSignal.timeout(getEffectiveAiPolicy(profileId).requestTimeoutSeconds * 1000),
    ]);
    const encoder = new TextEncoder();
    let sequence = 0;
    let closed = false;
    return new Response(
      new ReadableStream({
        start(controller) {
          const emit = (event: Record<string, unknown>) => {
            if (!closed && !request.signal.aborted && (!signal.aborted || event.type === 'error'))
              controller.enqueue(
                encoder.encode(`${JSON.stringify({ ...event, sequence: ++sequence })}\n`),
              );
          };
          emit({ type: 'status', message: 'Preparing a response…' });
          void runAiChatTurn({ ...input, signal, onEvent: emit })
            .then((result) => {
              for (const action of result.actions)
                emit({
                  type: 'action',
                  actionId: action.id,
                  kind: action.kind,
                  preview: action.preview,
                });
              for (const job of result.jobs) emit({ type: 'job', job });
              for (const card of result.suggestions) emit({ type: 'suggestion', card });
              for (const proposal of result.appActions) emit({ type: 'app_action', proposal });
              emit({
                type: 'done',
                messageId: result.message.id,
                actionId: result.message.actionId,
                content: result.message.content,
              });
            })
            .catch((error: unknown) => {
              emit({
                type: 'error',
                message:
                  error instanceof AiChatForbiddenError ||
                  error instanceof AiChatToolError ||
                  error instanceof AiChatRateLimitError ||
                  error instanceof AiAssistantProviderResponseError ||
                  error instanceof AiAssistantProviderUnavailableError
                    ? error.message
                    : 'The response could not finish. Reload the conversation to review any saved previews or tasks before trying again.',
              });
            })
            .finally(() => {
              closed = true;
              try {
                controller.close();
              } catch {
                /* The client may have explicitly stopped reading. */
              }
            });
        },
        cancel() {
          closed = true;
          abort.abort();
        },
      }),
      {
        headers: {
          'Content-Type': 'application/x-ndjson; charset=utf-8',
          'Cache-Control': 'no-store, no-transform',
          'X-Content-Type-Options': 'nosniff',
          'X-Accel-Buffering': 'no',
        },
      },
    );
  } catch (error) {
    if (error instanceof DecisionError) return decisionErrorResponse(error);
    if (error instanceof ZodError)
      return jsonError(400, 'invalid_message', 'Enter a valid message.');
    if (error instanceof AiChatToolError)
      return jsonError(400, 'invalid_attachment', error.message);
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
