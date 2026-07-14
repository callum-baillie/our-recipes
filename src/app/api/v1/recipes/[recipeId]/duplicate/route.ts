import { cookies } from 'next/headers';
import { NextResponse } from 'next/server';

import { ACTIVE_PROFILE_COOKIE, getActorContext } from '@/lib/actor-context';
import { hasTrustedMutationOrigin, jsonError } from '@/lib/http';
import { duplicateRecipe, RecipeNotFoundError } from '@/lib/services/recipe-service';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

export async function POST(_request: Request, context: { params: Promise<{ recipeId: string }> }) {
  if (!hasTrustedMutationOrigin(_request)) {
    return jsonError(403, 'untrusted_origin', 'This change must come from a trusted app origin.');
  }
  const actor = getActorContext((await cookies()).get(ACTIVE_PROFILE_COOKIE)?.value);
  if (!actor.profileId) {
    return jsonError(409, 'profile_selection_required', 'Choose a household profile first.');
  }
  try {
    const recipe = duplicateRecipe((await context.params).recipeId, actor.profileId);
    return NextResponse.json({ recipe }, { status: 201 });
  } catch (error) {
    if (error instanceof RecipeNotFoundError)
      return jsonError(404, 'recipe_not_found', error.message);
    throw error;
  }
}
