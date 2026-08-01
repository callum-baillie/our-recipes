import { randomUUID } from 'node:crypto';

import { jsonError } from '@/lib/http';
import { RequestAuthError } from '@/lib/services/auth-service';

export function requestId(request: Request): string {
  const incoming = request.headers.get('x-request-id')?.trim();
  return incoming && incoming.length <= 128 ? incoming : randomUUID();
}

export function withRequestId(response: Response, id: string): Response {
  response.headers.set('X-Request-Id', id);
  return response;
}

export function adminAuthError(error: unknown): Response | null {
  if (!(error instanceof RequestAuthError)) return null;
  const response = jsonError(error.status, error.code, error.message);
  if (error.retryAfterSeconds) {
    response.headers.set('Retry-After', String(error.retryAfterSeconds));
  }
  return response;
}
