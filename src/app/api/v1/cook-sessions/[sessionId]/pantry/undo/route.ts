import { withApiRequestId, authorizeCoreApi, actorFromPrincipal } from '@/lib/api-auth';

import { NextResponse } from 'next/server';

import { jsonError } from '@/lib/http';
import {
  PantryGroceryCookingConflictError,
  PantryGroceryCookingNotFoundError,
  undoCookSessionPantry,
} from '@/lib/services/pantry-grocery-cooking-service';

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
  try {
    return withApiRequestId(
      NextResponse.json(undoCookSessionPantry((await context.params).sessionId, actor.profileId)),
      access.requestId,
    );
  } catch (error) {
    if (error instanceof PantryGroceryCookingNotFoundError)
      return withApiRequestId(
        jsonError(404, 'pantry_cook_session_not_found', error.message),
        access.requestId,
      );
    if (error instanceof PantryGroceryCookingConflictError)
      return withApiRequestId(
        jsonError(409, 'pantry_undo_conflict', error.message),
        access.requestId,
      );
    throw error;
  }
}
