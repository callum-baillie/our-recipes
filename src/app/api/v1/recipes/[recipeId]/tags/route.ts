import { cookies } from 'next/headers';
import { NextResponse } from 'next/server';

import { ACTIVE_PROFILE_COOKIE, getActorContext } from '@/lib/actor-context';
import { recipeTagsUpdateSchema } from '@/lib/domain/recipe';
import { hasTrustedMutationOrigin, jsonError } from '@/lib/http';
import {
  RecipeConflictError,
  RecipeNotFoundError,
  updateRecipeTagsWithIntegrations,
} from '@/lib/services/recipe-service';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

export async function PATCH(request: Request, context: { params: Promise<{ recipeId: string }> }) {
  if (!hasTrustedMutationOrigin(request)) {
    return jsonError(403, 'untrusted_origin', 'This change must come from a trusted app origin.');
  }
  const actor = getActorContext((await cookies()).get(ACTIVE_PROFILE_COOKIE)?.value);
  if (!actor.profileId) {
    return jsonError(
      409,
      'profile_selection_required',
      'Choose a household profile before editing recipe tags.',
    );
  }
  const parsed = recipeTagsUpdateSchema.safeParse(await request.json().catch(() => null));
  if (!parsed.success)
    return jsonError(400, 'invalid_tags', 'Check the recipe tags and try again.');

  try {
    const { recipeId } = await context.params;
    return NextResponse.json(
      updateRecipeTagsWithIntegrations(
        recipeId,
        parsed.data.tags,
        actor.profileId,
        parsed.data.expectedRevision,
      ),
    );
  } catch (error) {
    if (error instanceof RecipeNotFoundError)
      return jsonError(404, 'recipe_not_found', error.message);
    if (error instanceof RecipeConflictError)
      return jsonError(409, 'recipe_revision_conflict', error.message);
    throw error;
  }
}
