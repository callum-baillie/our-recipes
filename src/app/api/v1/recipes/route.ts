import { cookies } from 'next/headers';
import { NextResponse } from 'next/server';

import { ACTIVE_PROFILE_COOKIE, getActorContext } from '@/lib/actor-context';
import { recipeInputSchema, recipeLibraryQuerySchema } from '@/lib/domain/recipe';
import { hasTrustedMutationOrigin, jsonError } from '@/lib/http';
import { createRecipe, listRecipeLibrary } from '@/lib/services/recipe-service';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

export async function GET(request: Request) {
  const parsed = recipeLibraryQuerySchema.safeParse(
    Object.fromEntries(new URL(request.url).searchParams.entries()),
  );
  if (!parsed.success) return jsonError(400, 'invalid_recipe_query', 'Check the recipe filters.');
  const actor = getActorContext((await cookies()).get(ACTIVE_PROFILE_COOKIE)?.value);
  return NextResponse.json({ library: listRecipeLibrary(parsed.data, actor.profileId) });
}

export async function POST(request: Request) {
  if (!hasTrustedMutationOrigin(request)) {
    return jsonError(403, 'untrusted_origin', 'This change must come from a trusted app origin.');
  }
  const actor = getActorContext((await cookies()).get(ACTIVE_PROFILE_COOKIE)?.value);
  if (!actor.profileId) {
    return jsonError(
      409,
      'profile_selection_required',
      'Choose a household profile before creating a recipe.',
    );
  }
  const parsed = recipeInputSchema.safeParse(await request.json().catch(() => null));
  if (!parsed.success)
    return jsonError(400, 'invalid_recipe', 'Check the highlighted recipe details.');
  const recipe = createRecipe(parsed.data, actor.profileId);
  return NextResponse.json({ recipe }, { status: 201 });
}
