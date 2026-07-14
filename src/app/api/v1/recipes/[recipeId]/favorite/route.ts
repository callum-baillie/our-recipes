import { cookies } from 'next/headers';
import { NextResponse } from 'next/server';

import { ACTIVE_PROFILE_COOKIE, getActorContext } from '@/lib/actor-context';
import { hasTrustedMutationOrigin, jsonError } from '@/lib/http';
import { CookingNotFoundError, setFavorite } from '@/lib/services/cooking-service';

export const runtime = 'nodejs';

export async function PUT(request: Request, context: { params: Promise<{ recipeId: string }> }) {
  if (!hasTrustedMutationOrigin(request))
    return jsonError(403, 'untrusted_origin', 'This change must come from a trusted app origin.');
  const actor = getActorContext((await cookies()).get(ACTIVE_PROFILE_COOKIE)?.value);
  if (!actor.profileId)
    return jsonError(409, 'profile_selection_required', 'Choose a household profile first.');
  const body = (await request.json().catch(() => null)) as { favorite?: unknown } | null;
  if (typeof body?.favorite !== 'boolean')
    return jsonError(400, 'invalid_favorite', 'Choose whether this recipe is a favorite.');
  try {
    return NextResponse.json({
      favorite: setFavorite((await context.params).recipeId, actor.profileId, body.favorite),
    });
  } catch (error) {
    if (error instanceof CookingNotFoundError)
      return jsonError(404, 'recipe_not_found', error.message);
    throw error;
  }
}
