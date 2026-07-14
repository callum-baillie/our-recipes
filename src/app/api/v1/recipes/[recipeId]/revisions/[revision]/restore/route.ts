import { cookies } from 'next/headers';
import { NextResponse } from 'next/server';

import { ACTIVE_PROFILE_COOKIE, getActorContext } from '@/lib/actor-context';
import { recipeRevisionRestoreInputSchema } from '@/lib/domain/recipe';
import { hasTrustedMutationOrigin, jsonError } from '@/lib/http';
import {
  RecipeConflictError,
  RecipeRevisionNotFoundError,
  restoreRecipeRevision,
} from '@/lib/services/recipe-service';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

export async function POST(
  request: Request,
  context: { params: Promise<{ recipeId: string; revision: string }> },
) {
  if (!hasTrustedMutationOrigin(request)) {
    return jsonError(403, 'untrusted_origin', 'This change must come from a trusted app origin.');
  }
  const actor = getActorContext((await cookies()).get(ACTIVE_PROFILE_COOKIE)?.value);
  if (!actor.profileId) {
    return jsonError(
      409,
      'profile_selection_required',
      'Choose a household profile before restoring a recipe version.',
    );
  }
  const input = recipeRevisionRestoreInputSchema.safeParse(await request.json().catch(() => null));
  if (!input.success) {
    return jsonError(
      400,
      'invalid_recipe_restore',
      'Refresh the recipe and choose a saved version again.',
    );
  }
  const { recipeId, revision } = await context.params;
  const sourceRevision = Number(revision);
  if (!Number.isSafeInteger(sourceRevision) || sourceRevision < 1) {
    return jsonError(400, 'invalid_recipe_revision', 'Choose a valid saved recipe version.');
  }
  try {
    return NextResponse.json({
      recipe: restoreRecipeRevision(
        recipeId,
        sourceRevision,
        actor.profileId,
        input.data.expectedRevision,
      ),
    });
  } catch (error) {
    if (error instanceof RecipeRevisionNotFoundError)
      return jsonError(404, 'recipe_revision_not_found', error.message);
    if (error instanceof RecipeConflictError)
      return jsonError(409, 'recipe_revision_conflict', error.message);
    throw error;
  }
}
