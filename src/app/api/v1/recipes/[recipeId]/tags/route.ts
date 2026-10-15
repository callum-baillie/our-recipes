import { withApiRequestId, authorizeCoreApi, actorFromPrincipal } from '@/lib/api-auth';

import { NextResponse } from 'next/server';

import { recipeTagsUpdateSchema } from '@/lib/domain/recipe';
import { jsonError } from '@/lib/http';
import {
  RecipeConflictError,
  RecipeNotFoundError,
  updateRecipeTagsWithIntegrations,
} from '@/lib/services/recipe-service';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

export async function PATCH(request: Request, context: { params: Promise<{ recipeId: string }> }) {
  const access = await authorizeCoreApi(request);
  if (access.response) return access.response;

  const actor = actorFromPrincipal(access.principal);
  if (!actor.profileId) {
    return withApiRequestId(
      jsonError(
        409,
        'profile_selection_required',
        'Choose a household profile before editing recipe tags.',
      ),
      access.requestId,
    );
  }
  const parsed = recipeTagsUpdateSchema.safeParse(await request.json().catch(() => null));
  if (!parsed.success)
    return withApiRequestId(
      jsonError(400, 'invalid_tags', 'Check the recipe tags and try again.'),
      access.requestId,
    );

  try {
    const { recipeId } = await context.params;
    return withApiRequestId(
      NextResponse.json(
        updateRecipeTagsWithIntegrations(
          recipeId,
          parsed.data.tags,
          actor.profileId,
          parsed.data.expectedRevision,
        ),
      ),
      access.requestId,
    );
  } catch (error) {
    if (error instanceof RecipeNotFoundError)
      return withApiRequestId(jsonError(404, 'recipe_not_found', error.message), access.requestId);
    if (error instanceof RecipeConflictError)
      return withApiRequestId(
        jsonError(409, 'recipe_revision_conflict', error.message),
        access.requestId,
      );
    throw error;
  }
}
