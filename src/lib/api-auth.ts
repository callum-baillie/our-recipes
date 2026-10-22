import { z } from 'zod';
import { canAccountUseAi } from '@/lib/services/ai-access-service';
import { NextResponse } from 'next/server';
import { randomUUID } from 'node:crypto';

import type { ApiAction, ApiResource } from '@/lib/domain/auth';
import type { ActorContext } from '@/lib/actor-context';
import {
  integrationPermission,
  additionalIntegrationPermissions,
} from '@/lib/domain/integration-routes';
import { authorizeAppRequest } from '@/lib/domain/permissions';
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
    const principal = await authenticateApiRequest(request, resource, action);
    const expectedProfile = request.headers.get('x-bord-expected-profile-id');
    const expectedUser = request.headers.get('x-bord-expected-user-id');
    if (
      (expectedProfile !== null || expectedUser !== null) &&
      request.method === 'POST' &&
      /^\/api\/v1\/(?:pantry\/(?:batches|catalog-imports)|shopping-lists\/[^/]+\/catalog-items)$/.test(
        new URL(request.url).pathname,
      )
    ) {
      const originError = requireTrustedSessionMutation(request, principal, requestId);
      if (originError) return { principal: null, requestId, response: originError };
      if (
        expectedUser !== null &&
        !z
          .string()
          .min(1)
          .max(256)
          .refine((value) => value.trim() === value)
          .safeParse(expectedUser).success
      )
        return {
          principal: null,
          requestId,
          response: withApiRequestId(
            jsonError(
              400,
              'invalid_expected_user',
              'Review the original account before confirming.',
            ),
            requestId,
          ),
        };
      if (expectedUser !== null && expectedUser !== principal.userId)
        return {
          principal: null,
          requestId,
          response: withApiRequestId(
            jsonError(
              409,
              'reviewed_actor_changed',
              'The signed-in account changed. Return to the original account to reconcile this reviewed operation.',
            ),
            requestId,
          ),
        };
      if (expectedProfile !== null && !z.string().uuid().safeParse(expectedProfile).success)
        return {
          principal: null,
          requestId,
          response: withApiRequestId(
            jsonError(
              400,
              'invalid_expected_profile',
              'Review the original profile before confirming.',
            ),
            requestId,
          ),
        };
      if (expectedProfile !== null && expectedProfile !== principal.profileId)
        return {
          principal: null,
          requestId,
          response: withApiRequestId(
            jsonError(
              409,
              'reviewed_actor_changed',
              'The active profile changed. Return to the original profile to reconcile this reviewed operation.',
            ),
            requestId,
          ),
        };
    }

    const aiMutation =
      !['GET', 'HEAD', 'OPTIONS'].includes(request.method) &&
      /(?:\/ai\/|\/images\/generate$|\/nutrition\/estimate$|\/improve$)/u.test(
        new URL(request.url).pathname,
      );
    if (
      aiMutation &&
      (!canAccountUseAi(principal.userId) || principal.profileId !== principal.linkedProfileId)
    )
      throw new RequestAuthError(
        403,
        'ai_disabled',
        'AI is disabled or requires your own account profile.',
      );
    if (principal.kind === 'api-key') {
      for (const required of additionalIntegrationPermissions(
        new URL(request.url).pathname,
        request.method,
      )) {
        if (!principal.apiPermissions?.[required.resource]?.includes(required.action)) {
          throw new RequestAuthError(
            403,
            'insufficient_api_key_permissions',
            `This API key also needs ${required.resource}:${required.action} permission.`,
          );
        }
      }
    }
    const permission = authorizeAppRequest({
      role: principal.role,
      profileId: principal.profileId,
      pathname: new URL(request.url).pathname,
      method: request.method,
    });
    if (!permission.allowed) {
      throw new RequestAuthError(403, permission.code, permission.message);
    }
    return {
      principal,
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

/** Authenticate the exact operation before reading input or calling its service. */
export async function authorizeCoreApi(request: Request): Promise<ApiAuthorization> {
  const permission = integrationPermission(new URL(request.url).pathname, request.method);
  if (!permission) {
    const requestId = randomUUID();
    return {
      principal: null,
      requestId,
      response: withApiRequestId(
        jsonError(403, 'api_key_route_forbidden', 'This operation is not an integration endpoint.'),
        requestId,
      ),
    };
  }
  const authorization = await authorizeApi(request, permission.resource, permission.action);
  if (authorization.response) return authorization;
  if (!['GET', 'HEAD', 'OPTIONS'].includes(request.method)) {
    const response = requireTrustedSessionMutation(
      request,
      authorization.principal,
      authorization.requestId,
    );
    if (response) return { principal: null, response, requestId: authorization.requestId };
  }
  return authorization;
}

export function actorFromPrincipal(
  principal: RequestPrincipal,
): ActorContext & { profileId: string } {
  return {
    profileId: principal.profileId,
    source: principal.kind === 'api-key' ? 'api-key' : 'auth-session',
  };
}

export function withApiRequestId<T extends Response>(response: T, requestId: string): T {
  response.headers.set('X-Request-Id', requestId);
  if (!response.headers.has('Cache-Control'))
    response.headers.set('Cache-Control', 'private, no-store');
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
