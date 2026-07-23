import { cookies } from 'next/headers';
import { NextResponse } from 'next/server';

import { ACTIVE_PROFILE_COOKIE, getActorContext } from '@/lib/actor-context';
import { recipeUpdateInputSchema } from '@/lib/domain/recipe';
import { hasTrustedMutationOrigin, jsonError } from '@/lib/http';
import {
  getRecipe,
  RecipeConflictError,
  RecipeNotFoundError,
  updateRecipeWithIntegrations,
} from '@/lib/services/recipe-service';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

export async function GET(_request: Request, context: { params: Promise<{ recipeId: string }> }) {
  const { recipeId } = await context.params;
  const actor = getActorContext((await cookies()).get(ACTIVE_PROFILE_COOKIE)?.value);
  const recipe = getRecipe(recipeId, actor.profileId);
  return recipe
    ? NextResponse.json({ recipe })
    : jsonError(404, 'recipe_not_found', 'That recipe no longer exists.');
}

export async function PUT(request: Request, context: { params: Promise<{ recipeId: string }> }) {
  if (!hasTrustedMutationOrigin(request)) {
    return jsonError(403, 'untrusted_origin', 'This change must come from a trusted app origin.');
  }
  const actor = getActorContext((await cookies()).get(ACTIVE_PROFILE_COOKIE)?.value);
  if (!actor.profileId) {
    return jsonError(
      409,
      'profile_selection_required',
      'Choose a household profile before editing a recipe.',
    );
  }
  const parsed = recipeUpdateInputSchema.safeParse(await request.json().catch(() => null));
  if (!parsed.success)
    return jsonError(400, 'invalid_recipe', 'Check the highlighted recipe details.');
  try {
    const { recipeId } = await context.params;
    const result = updateRecipeWithIntegrations(
      recipeId,
      parsed.data,
      actor.profileId,
      parsed.data.expectedRevision,
    );
    return NextResponse.json(result);
  } catch (error) {
    if (error instanceof RecipeNotFoundError)
      return jsonError(404, 'recipe_not_found', error.message);
    if (error instanceof RecipeConflictError)
      return jsonError(409, 'recipe_revision_conflict', error.message);
    throw error;
  }
}
