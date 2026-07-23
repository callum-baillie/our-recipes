import { cookies } from 'next/headers';
import { NextResponse } from 'next/server';

import { ACTIVE_PROFILE_COOKIE, getActorContext } from '@/lib/actor-context';
import { hasTrustedMutationOrigin, jsonError } from '@/lib/http';
import {
  PantryGroceryCookingConflictError,
  PantryGroceryCookingNotFoundError,
  undoCookSessionPantry,
} from '@/lib/services/pantry-grocery-cooking-service';

export const runtime = 'nodejs';

export async function POST(request: Request, context: { params: Promise<{ sessionId: string }> }) {
  if (!hasTrustedMutationOrigin(request))
    return jsonError(403, 'untrusted_origin', 'This change must come from a trusted app origin.');
  const actor = getActorContext((await cookies()).get(ACTIVE_PROFILE_COOKIE)?.value);
  if (!actor.profileId)
    return jsonError(409, 'profile_selection_required', 'Choose a household profile first.');
  try {
    return NextResponse.json(
      undoCookSessionPantry((await context.params).sessionId, actor.profileId),
    );
  } catch (error) {
    if (error instanceof PantryGroceryCookingNotFoundError)
      return jsonError(404, 'pantry_cook_session_not_found', error.message);
    if (error instanceof PantryGroceryCookingConflictError)
      return jsonError(409, 'pantry_undo_conflict', error.message);
    throw error;
  }
}
