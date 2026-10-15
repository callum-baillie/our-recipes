import { withApiRequestId, authorizeCoreApi, actorFromPrincipal } from '@/lib/api-auth';

import { NextResponse } from 'next/server';

import { recipePreferenceInputSchema, recipeReactionInputSchema } from '@/lib/domain/recipe';
import { jsonError } from '@/lib/http';
import {
  RecipeNotFoundError,
  setRecipePreference,
  setRecipeReaction,
} from '@/lib/services/recipe-service';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

export async function PUT(request: Request, context: { params: Promise<{ recipeId: string }> }) {
  const access = await authorizeCoreApi(request);
  if (access.response) return access.response;

  const actor = actorFromPrincipal(access.principal);
  if (!actor.profileId) {
    return withApiRequestId(
      jsonError(
        409,
        'profile_selection_required',
        'Choose a household profile before saving a personal preference.',
      ),
      access.requestId,
    );
  }
  const parsed = recipePreferenceInputSchema.safeParse(await request.json().catch(() => null));
  if (!parsed.success) {
    return withApiRequestId(
      jsonError(400, 'invalid_recipe_preference', 'Use a rating from 1 to 5 and a shorter note.'),
      access.requestId,
    );
  }
  try {
    return withApiRequestId(
      NextResponse.json({
        preference: setRecipePreference(
          (await context.params).recipeId,
          actor.profileId,
          parsed.data,
        ),
      }),
      access.requestId,
    );
  } catch (error) {
    if (error instanceof RecipeNotFoundError)
      return withApiRequestId(jsonError(404, 'recipe_not_found', error.message), access.requestId);
    throw error;
  }
}

export async function PATCH(request: Request, context: { params: Promise<{ recipeId: string }> }) {
  const access = await authorizeCoreApi(request);
  if (access.response) return access.response;

  const actor = actorFromPrincipal(access.principal);
  if (!actor.profileId) {
    return withApiRequestId(
      jsonError(
        409,
        'profile_selection_required',
        'Choose a household profile before reacting to a recipe.',
      ),
      access.requestId,
    );
  }
  const parsed = recipeReactionInputSchema.safeParse(await request.json().catch(() => null));
  if (!parsed.success) {
    return withApiRequestId(
      jsonError(400, 'invalid_recipe_reaction', 'Choose dislike, like, staple, or no reaction.'),
      access.requestId,
    );
  }
  try {
    return withApiRequestId(
      NextResponse.json({
        preference: setRecipeReaction(
          (await context.params).recipeId,
          actor.profileId,
          parsed.data.score,
        ),
      }),
      access.requestId,
    );
  } catch (error) {
    if (error instanceof RecipeNotFoundError)
      return withApiRequestId(jsonError(404, 'recipe_not_found', error.message), access.requestId);
    throw error;
  }
}
