import { withApiRequestId, authorizeCoreApi, actorFromPrincipal } from '@/lib/api-auth';

import { NextResponse } from 'next/server';

import { jsonError } from '@/lib/http';
import { duplicateRecipe, RecipeNotFoundError } from '@/lib/services/recipe-service';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

export async function POST(_request: Request, context: { params: Promise<{ recipeId: string }> }) {
  const access = await authorizeCoreApi(_request);
  if (access.response) return access.response;

  const actor = actorFromPrincipal(access.principal);
  if (!actor.profileId) {
    return withApiRequestId(
      jsonError(409, 'profile_selection_required', 'Choose a household profile first.'),
      access.requestId,
    );
  }
  try {
    const recipe = duplicateRecipe((await context.params).recipeId, actor.profileId);
    return withApiRequestId(NextResponse.json({ recipe }, { status: 201 }), access.requestId);
  } catch (error) {
    if (error instanceof RecipeNotFoundError)
      return withApiRequestId(jsonError(404, 'recipe_not_found', error.message), access.requestId);
    throw error;
  }
}
