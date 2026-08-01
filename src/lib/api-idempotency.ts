import 'server-only';

import { and, eq, lt } from 'drizzle-orm';
import { createHash, createHmac, randomUUID } from 'node:crypto';
import { NextResponse } from 'next/server';

import { getRuntimeConfig } from '@/lib/config';
import { ensureDatabase, getDatabase } from '@/lib/db/client';
import { apiIdempotencyRecords } from '@/lib/db/schema';
import { idempotencyKeySchema } from '@/lib/domain/auth';
import { jsonError } from '@/lib/http';
import type { RequestPrincipal } from '@/lib/services/auth-service';

const IDEMPOTENCY_TTL_MS = 24 * 60 * 60 * 1_000;

export type IdempotencyContext = {
  body: unknown;
  keyHash: string | null;
  method: string;
  path: string;
  requestHash: string;
  principal: RequestPrincipal;
};

export type IdempotencyPreparation =
  { context: IdempotencyContext; response: null } | { context: null; response: NextResponse };

function keyDigest(principal: RequestPrincipal, key: string): string {
  return createHmac('sha256', getRuntimeConfig().auth.secret)
    .update(`${principal.apiKeyId}:${key}`)
    .digest('base64url');
}

function requestDigest(method: string, path: string, rawBody: string): string {
  return createHash('sha256').update(`${method}\n${path}\n${rawBody}`).digest('base64url');
}

function responseWithRequestId(response: NextResponse, requestId: string): NextResponse {
  response.headers.set('X-Request-Id', requestId);
  return response;
}

export async function prepareIdempotentMutation(
  request: Request,
  principal: RequestPrincipal,
  requestId: string,
): Promise<IdempotencyPreparation> {
  const rawBody = await request.text();
  let body: unknown = null;
  try {
    body = rawBody ? JSON.parse(rawBody) : null;
  } catch {
    return {
      context: null,
      response: responseWithRequestId(
        jsonError(400, 'invalid_json', 'Send a valid JSON request body.'),
        requestId,
      ),
    };
  }

  const url = new URL(request.url);
  const method = request.method.toUpperCase();
  const path = url.pathname;
  const requestHash = requestDigest(method, path, rawBody);
  if (principal.kind === 'session') {
    return {
      context: { body, keyHash: null, method, path, requestHash, principal },
      response: null,
    };
  }

  const key = idempotencyKeySchema.safeParse(request.headers.get('idempotency-key'));
  if (!key.success) {
    return {
      context: null,
      response: responseWithRequestId(
        jsonError(
          400,
          'idempotency_key_required',
          'API-key create requests require a valid Idempotency-Key header.',
        ),
        requestId,
      ),
    };
  }

  ensureDatabase();
  const db = getDatabase();
  const now = new Date();
  db.delete(apiIdempotencyRecords).where(lt(apiIdempotencyRecords.expiresAt, now)).run();
  const keyHash = keyDigest(principal, key.data);
  const existing = db
    .select()
    .from(apiIdempotencyRecords)
    .where(
      and(
        eq(apiIdempotencyRecords.keyHash, keyHash),
        eq(apiIdempotencyRecords.method, method),
        eq(apiIdempotencyRecords.path, path),
      ),
    )
    .get();
  if (existing) {
    if (existing.requestHash !== requestHash) {
      return {
        context: null,
        response: responseWithRequestId(
          jsonError(
            409,
            'idempotency_key_conflict',
            'That Idempotency-Key was already used with a different request body.',
          ),
          requestId,
        ),
      };
    }
    const response = new NextResponse(existing.responseBody, {
      status: existing.status,
      headers: {
        'Content-Type': 'application/json; charset=utf-8',
        'Idempotency-Replayed': 'true',
      },
    });
    return { context: null, response: responseWithRequestId(response, requestId) };
  }

  return {
    context: { body, keyHash, method, path, requestHash, principal },
    response: null,
  };
}

export function idempotentJsonResponse(
  context: IdempotencyContext,
  payload: unknown,
  requestId: string,
  status = 200,
): NextResponse {
  const responseBody = JSON.stringify(payload);
  if (context.keyHash) {
    const now = new Date();
    getDatabase()
      .insert(apiIdempotencyRecords)
      .values({
        id: randomUUID(),
        keyHash: context.keyHash,
        method: context.method,
        path: context.path,
        requestHash: context.requestHash,
        status,
        responseBody,
        userId: context.principal.userId,
        apiKeyId: context.principal.apiKeyId,
        createdAt: now,
        expiresAt: new Date(now.getTime() + IDEMPOTENCY_TTL_MS),
      })
      .onConflictDoNothing()
      .run();
  }
  const response = new NextResponse(responseBody, {
    status,
    headers: {
      'Content-Type': 'application/json; charset=utf-8',
      ...(context.keyHash ? { 'Idempotency-Replayed': 'false' } : {}),
    },
  });
  return responseWithRequestId(response, requestId);
}
