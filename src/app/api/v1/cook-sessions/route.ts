import { withApiRequestId, authorizeCoreApi, actorFromPrincipal } from '@/lib/api-auth';

import { NextResponse } from 'next/server';

import { cookSessionStartSchema } from '@/lib/domain/cooking';
import { cookSessionPantryStartSchema } from '@/lib/domain/pantry-grocery-cooking';
import { jsonError } from '@/lib/http';
import { CookingNotFoundError, startCookSession } from '@/lib/services/cooking-service';
import { getCookSessionPantryPreview } from '@/lib/services/pantry-grocery-cooking-service';

export const runtime = 'nodejs';

export async function POST(request: Request) {
  const access = await authorizeCoreApi(request);
  if (access.response) return access.response;

  const actor = actorFromPrincipal(access.principal);
  if (!actor.profileId)
    return withApiRequestId(
      jsonError(409, 'profile_selection_required', 'Choose a household profile first.'),
      access.requestId,
    );
  const body = await request.json().catch(() => null);
  const parsed = cookSessionStartSchema.safeParse(body);
  const pantryParsed = cookSessionPantryStartSchema.safeParse(body);
  if (!parsed.success)
    return withApiRequestId(
      jsonError(400, 'invalid_cook_session', 'Use a valid recipe and serving count.'),
      access.requestId,
    );
  try {
    const session = startCookSession(
      parsed.data.recipeId,
      actor.profileId,
      parsed.data.targetServings,
      pantryParsed.success && pantryParsed.data.mealPlanEntryId
        ? pantryParsed.data.mealPlanEntryId
        : null,
    );
    return withApiRequestId(
      NextResponse.json(
        { session, pantry: getCookSessionPantryPreview(session.id, actor.profileId) },
        { status: 201 },
      ),
      access.requestId,
    );
  } catch (error) {
    if (error instanceof CookingNotFoundError)
      return withApiRequestId(jsonError(404, 'recipe_not_found', error.message), access.requestId);
    throw error;
  }
}
