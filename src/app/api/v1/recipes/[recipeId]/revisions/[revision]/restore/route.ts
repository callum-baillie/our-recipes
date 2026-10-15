import { withApiRequestId, authorizeCoreApi, actorFromPrincipal } from '@/lib/api-auth';

import { NextResponse } from 'next/server';

import { recipeRevisionRestoreInputSchema } from '@/lib/domain/recipe';
import { jsonError } from '@/lib/http';
import {
  RecipeConflictError,
  RecipeRevisionNotFoundError,
  restoreRecipeRevisionWithIntegrations,
} from '@/lib/services/recipe-service';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

export async function POST(
  request: Request,
  context: { params: Promise<{ recipeId: string; revision: string }> },
) {
  const access = await authorizeCoreApi(request);
  if (access.response) return access.response;

  const actor = actorFromPrincipal(access.principal);
  if (!actor.profileId) {
    return withApiRequestId(
      jsonError(
        409,
        'profile_selection_required',
        'Choose a household profile before restoring a recipe version.',
      ),
      access.requestId,
    );
  }
  const input = recipeRevisionRestoreInputSchema.safeParse(await request.json().catch(() => null));
  if (!input.success) {
    return withApiRequestId(
      jsonError(
        400,
        'invalid_recipe_restore',
        'Refresh the recipe and choose a saved version again.',
      ),
      access.requestId,
    );
  }
  const { recipeId, revision } = await context.params;
  const sourceRevision = Number(revision);
  if (!Number.isSafeInteger(sourceRevision) || sourceRevision < 1) {
    return withApiRequestId(
      jsonError(400, 'invalid_recipe_revision', 'Choose a valid saved recipe version.'),
      access.requestId,
    );
  }
  try {
    return withApiRequestId(
      NextResponse.json(
        restoreRecipeRevisionWithIntegrations(
          recipeId,
          sourceRevision,
          actor.profileId,
          input.data.expectedRevision,
        ),
      ),
      access.requestId,
    );
  } catch (error) {
    if (error instanceof RecipeRevisionNotFoundError)
      return withApiRequestId(
        jsonError(404, 'recipe_revision_not_found', error.message),
        access.requestId,
      );
    if (error instanceof RecipeConflictError)
      return withApiRequestId(
        jsonError(409, 'recipe_revision_conflict', error.message),
        access.requestId,
      );
    throw error;
  }
}
