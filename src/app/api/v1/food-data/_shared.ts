import { cookies } from 'next/headers';
import { NextResponse } from 'next/server';
import { ZodError } from 'zod';

import { ACTIVE_PROFILE_COOKIE, getActorContext } from '@/lib/actor-context';
import { FoodDataError } from '@/lib/domain/food-data';
import { hasTrustedMutationOrigin, jsonError } from '@/lib/http';
import { PantryConflictError, PantryValidationError } from '@/lib/services/pantry-service';

export function rejectUntrustedFoodDataRequest(request: Request) {
  return hasTrustedMutationOrigin(request)
    ? null
    : jsonError(403, 'untrusted_origin', 'This request must come from a trusted app origin.');
}

export async function requireFoodDataActor() {
  const actor = getActorContext((await cookies()).get(ACTIVE_PROFILE_COOKIE)?.value);
  return actor.profileId
    ? { profileId: actor.profileId, response: null }
    : {
        profileId: null,
        response: jsonError(
          409,
          'profile_selection_required',
          'Choose a household profile before using food data.',
        ),
      };
}

export function foodDataApiError(error: unknown): NextResponse {
  if (error instanceof ZodError)
    return NextResponse.json(
      {
        error: {
          code: 'INVALID_QUERY',
          message: 'Food-data input is invalid.',
          issues: error.issues,
        },
      },
      { status: 400 },
    );
  if (error instanceof PantryConflictError)
    return jsonError(409, 'food_import_conflict', error.message);
  if (error instanceof PantryValidationError)
    return jsonError(400, 'food_import_invalid', error.message);
  if (error instanceof FoodDataError) {
    const status =
      error.code === 'REVISION_EXPIRED'
        ? 409
        : error.code === 'NOT_FOUND'
          ? 404
          : error.code === 'RATE_LIMITED'
            ? 429
            : error.code === 'AUTH_FAILED'
              ? 502
              : error.code === 'TIMEOUT'
                ? 504
                : error.code === 'INVALID_BARCODE' || error.code === 'INVALID_QUERY'
                  ? 400
                  : 503;
    return NextResponse.json(
      {
        error: {
          code: error.code,
          message: error.message,
          provider: error.provider,
          retryAt: error.retryAt?.toISOString() ?? null,
        },
      },
      { status, headers: { 'Cache-Control': 'private, no-store' } },
    );
  }
  return jsonError(500, 'food_data_error', 'Food data could not complete this request.');
}

export async function readFoodDataJson(request: Request) {
  try {
    const reader = request.body?.getReader();
    if (!reader) throw new Error('Missing body');
    let bytes = 0;
    const chunks: Uint8Array[] = [];
    try {
      while (true) {
        const result = await reader.read();
        if (result.done) break;
        bytes += result.value.byteLength;
        if (bytes > 128 * 1024) {
          await reader.cancel();
          throw new Error('Body too large');
        }
        chunks.push(result.value);
      }
    } finally {
      reader.releaseLock();
    }
    return JSON.parse(Buffer.concat(chunks).toString('utf8')) as unknown;
  } catch {
    throw new ZodError([
      { code: 'custom', path: [], message: 'Request body must contain valid JSON.' },
    ]);
  }
}

export function foodDataJson(body: unknown, init: ResponseInit = {}) {
  const headers = new Headers(init.headers);
  headers.set('Cache-Control', 'private, no-store');
  return NextResponse.json(body, { ...init, headers });
}
