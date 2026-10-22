import 'server-only';
import { z } from 'zod';
import { getAuthenticatedSessionPrincipal } from '@/lib/services/auth-service';
import { canAccountUseAi } from './ai-access-service';
import { hasTrustedMutationOrigin } from '@/lib/http';
import { DecisionError } from '@/lib/providers/decisions-provider';

export async function decisionPrincipal(request: Request) {
  if (request.method !== 'GET' && !hasTrustedMutationOrigin(request))
    throw new DecisionError('Use a trusted app origin.', 403);
  const p = await getAuthenticatedSessionPrincipal(request);
  if (!p) throw new DecisionError('Sign in to use AI assistance.', 401);
  if (!canAccountUseAi(p.userId))
    throw new DecisionError('This account cannot use AI assistance.', 403);
  return p;
}
export async function boundedDecisionJson(request: Request, maximum = 16_384) {
  if (Number(request.headers.get('content-length') ?? 0) > maximum)
    throw new DecisionError('Request is too large.', 413);
  const reader = request.body?.getReader();
  if (!reader) throw new DecisionError('A request body is required.');
  const chunks: Uint8Array[] = [];
  let length = 0;
  try {
    while (true) {
      const { value, done } = await reader.read();
      if (done) break;
      length += value.length;
      if (length > maximum) {
        await reader.cancel();
        throw new DecisionError('Request is too large.', 413);
      }
      chunks.push(value);
    }
    return JSON.parse(Buffer.concat(chunks).toString('utf8')) as unknown;
  } catch (error) {
    if (error instanceof DecisionError) throw error;
    throw new DecisionError('Invalid JSON body.');
  }
}
export function decisionErrorResponse(error: unknown) {
  const status =
    error instanceof DecisionError
      ? error.status
      : error instanceof z.ZodError || error instanceof SyntaxError
        ? 400
        : 500;
  return Response.json(
    {
      error: {
        ...(error instanceof z.ZodError
          ? {
              fields: Object.fromEntries(
                error.issues
                  .slice(0, 40)
                  .map((issue) => [issue.path.join('.') || '_form', issue.message]),
              ),
            }
          : {}),
        message:
          error instanceof DecisionError
            ? error.message
            : error instanceof z.ZodError || error instanceof SyntaxError
              ? 'Check the selection and request fields.'
              : 'Unable to prepare suggestions. Please try again.',
      },
    },
    { status, headers: { 'Cache-Control': 'no-store' } },
  );
}
