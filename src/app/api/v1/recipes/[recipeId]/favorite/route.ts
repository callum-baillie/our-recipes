import { withApiRequestId, authorizeCoreApi, actorFromPrincipal } from '@/lib/api-auth';

import { NextResponse } from 'next/server';

import { jsonError } from '@/lib/http';
import { CookingNotFoundError, setFavorite } from '@/lib/services/cooking-service';

export const runtime = 'nodejs';

export async function PUT(request: Request, context: { params: Promise<{ recipeId: string }> }) {
  const access = await authorizeCoreApi(request);
  if (access.response) return access.response;

  const actor = actorFromPrincipal(access.principal);
  if (!actor.profileId)
    return withApiRequestId(
      jsonError(409, 'profile_selection_required', 'Choose a household profile first.'),
      access.requestId,
    );
  const body = (await request.json().catch(() => null)) as { favorite?: unknown } | null;
  if (typeof body?.favorite !== 'boolean')
    return withApiRequestId(
      jsonError(400, 'invalid_favorite', 'Choose whether this recipe is a favorite.'),
      access.requestId,
    );
  try {
    return withApiRequestId(
      NextResponse.json({
        favorite: setFavorite((await context.params).recipeId, actor.profileId, body.favorite),
      }),
      access.requestId,
    );
  } catch (error) {
    if (error instanceof CookingNotFoundError)
      return withApiRequestId(jsonError(404, 'recipe_not_found', error.message), access.requestId);
    throw error;
  }
}
