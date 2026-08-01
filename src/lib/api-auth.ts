import { NextResponse } from 'next/server';
import { randomUUID } from 'node:crypto';

import type { ApiAction, ApiResource } from '@/lib/domain/auth';
import { hasTrustedMutationOrigin, jsonError } from '@/lib/http';
import {
  authenticateApiRequest,
  RequestAuthError,
  type RequestPrincipal,
} from '@/lib/services/auth-service';

export type ApiAuthorization =
  | { principal: RequestPrincipal; response: null; requestId: string }
  | { principal: null; response: NextResponse; requestId: string };

export async function authorizeApi(
  request: Request,
  resource: ApiResource,
  action: ApiAction,
): Promise<ApiAuthorization> {
  const incoming = request.headers.get('x-request-id')?.trim();
  const requestId = incoming && incoming.length <= 128 ? incoming : randomUUID();
  try {
    return {
      principal: await authenticateApiRequest(request, resource, action),
      response: null,
      requestId,
    };
  } catch (error) {
    if (!(error instanceof RequestAuthError)) throw error;
    const response = jsonError(error.status, error.code, error.message);
    response.headers.set('X-Request-Id', requestId);
    if (error.retryAfterSeconds) {
      response.headers.set('Retry-After', String(error.retryAfterSeconds));
    }
    return { principal: null, response, requestId };
  }
}

export function withApiRequestId<T extends NextResponse>(response: T, requestId: string): T {
  response.headers.set('X-Request-Id', requestId);
  return response;
}

export function requireTrustedSessionMutation(
  request: Request,
  principal: RequestPrincipal,
  requestId: string,
): NextResponse | null {
  if (principal.kind === 'api-key' || hasTrustedMutationOrigin(request)) return null;
  return withApiRequestId(
    jsonError(403, 'untrusted_origin', 'This change must come from a trusted app origin.'),
    requestId,
  );
}
