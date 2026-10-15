import { withApiRequestId, authorizeCoreApi, actorFromPrincipal } from '@/lib/api-auth';

import { NextResponse } from 'next/server';

import { pantryCookConfirmationSchema } from '@/lib/domain/pantry-grocery-cooking';
import { jsonError } from '@/lib/http';
import {
  confirmCookSessionWithPantry,
  PantryGroceryCookingConflictError,
  PantryGroceryCookingNotFoundError,
} from '@/lib/services/pantry-grocery-cooking-service';
import {
  PantryConflictError,
  PantryNotFoundError,
  PantryValidationError,
} from '@/lib/services/pantry-service';

export const runtime = 'nodejs';

export async function POST(request: Request, context: { params: Promise<{ sessionId: string }> }) {
  const access = await authorizeCoreApi(request);
  if (access.response) return access.response;

  const actor = actorFromPrincipal(access.principal);
  if (!actor.profileId)
    return withApiRequestId(
      jsonError(409, 'profile_selection_required', 'Choose a household profile first.'),
      access.requestId,
    );
  const parsed = pantryCookConfirmationSchema.safeParse(await request.json().catch(() => null));
  if (!parsed.success)
    return withApiRequestId(
      jsonError(
        400,
        'explicit_pantry_confirmation_required',
        'Review Pantry deductions and explicitly confirm them before finishing.',
      ),
      access.requestId,
    );
  try {
    return withApiRequestId(
      NextResponse.json({
        ok: true,
        pantry: confirmCookSessionWithPantry(
          (await context.params).sessionId,
          parsed.data,
          actor.profileId,
        ),
      }),
      access.requestId,
    );
  } catch (error) {
    if (error instanceof PantryGroceryCookingNotFoundError || error instanceof PantryNotFoundError)
      return withApiRequestId(
        jsonError(404, 'cook_session_not_found', error.message),
        access.requestId,
      );
    if (error instanceof PantryGroceryCookingConflictError || error instanceof PantryConflictError)
      return withApiRequestId(
        jsonError(409, 'pantry_cooking_conflict', error.message),
        access.requestId,
      );
    if (error instanceof PantryValidationError)
      return withApiRequestId(
        jsonError(400, 'invalid_pantry_deduction', error.message),
        access.requestId,
      );
    throw error;
  }
}
