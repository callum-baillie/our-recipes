import { cookies } from 'next/headers';
import { NextResponse } from 'next/server';

import { ACTIVE_PROFILE_COOKIE, getActorContext } from '@/lib/actor-context';
import { pantryCookConfirmationSchema } from '@/lib/domain/pantry-grocery-cooking';
import { hasTrustedMutationOrigin, jsonError } from '@/lib/http';
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
  if (!hasTrustedMutationOrigin(request))
    return jsonError(403, 'untrusted_origin', 'This change must come from a trusted app origin.');
  const actor = getActorContext((await cookies()).get(ACTIVE_PROFILE_COOKIE)?.value);
  if (!actor.profileId)
    return jsonError(409, 'profile_selection_required', 'Choose a household profile first.');
  const parsed = pantryCookConfirmationSchema.safeParse(await request.json().catch(() => null));
  if (!parsed.success)
    return jsonError(
      400,
      'explicit_pantry_confirmation_required',
      'Review Pantry deductions and explicitly confirm them before finishing.',
    );
  try {
    return NextResponse.json({
      ok: true,
      pantry: confirmCookSessionWithPantry(
        (await context.params).sessionId,
        parsed.data,
        actor.profileId,
      ),
    });
  } catch (error) {
    if (error instanceof PantryGroceryCookingNotFoundError || error instanceof PantryNotFoundError)
      return jsonError(404, 'cook_session_not_found', error.message);
    if (error instanceof PantryGroceryCookingConflictError || error instanceof PantryConflictError)
      return jsonError(409, 'pantry_cooking_conflict', error.message);
    if (error instanceof PantryValidationError)
      return jsonError(400, 'invalid_pantry_deduction', error.message);
    throw error;
  }
}
