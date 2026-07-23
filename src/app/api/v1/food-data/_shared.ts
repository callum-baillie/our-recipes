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
      error.code === 'NOT_FOUND'
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
    return await request.json();
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
