import { cookies } from 'next/headers';
import { NextResponse } from 'next/server';

import { ACTIVE_PROFILE_COOKIE, getActorContext } from '@/lib/actor-context';
import { recipePreferenceInputSchema } from '@/lib/domain/recipe';
import { hasTrustedMutationOrigin, jsonError } from '@/lib/http';
import { RecipeNotFoundError, setRecipePreference } from '@/lib/services/recipe-service';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

export async function PUT(request: Request, context: { params: Promise<{ recipeId: string }> }) {
  if (!hasTrustedMutationOrigin(request)) {
    return jsonError(403, 'untrusted_origin', 'This change must come from a trusted app origin.');
  }
  const actor = getActorContext((await cookies()).get(ACTIVE_PROFILE_COOKIE)?.value);
  if (!actor.profileId) {
    return jsonError(
      409,
      'profile_selection_required',
      'Choose a household profile before saving a personal preference.',
    );
  }
  const parsed = recipePreferenceInputSchema.safeParse(await request.json().catch(() => null));
  if (!parsed.success) {
    return jsonError(
      400,
      'invalid_recipe_preference',
      'Use a rating from 1 to 5 and a shorter note.',
    );
  }
  try {
    return NextResponse.json({
      preference: setRecipePreference(
        (await context.params).recipeId,
        actor.profileId,
        parsed.data,
      ),
    });
  } catch (error) {
    if (error instanceof RecipeNotFoundError)
      return jsonError(404, 'recipe_not_found', error.message);
    throw error;
  }
}
