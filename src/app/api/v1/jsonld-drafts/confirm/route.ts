import { cookies } from 'next/headers';
import { NextResponse } from 'next/server';

import { ACTIVE_PROFILE_COOKIE, getActorContext } from '@/lib/actor-context';
import { jsonLdConfirmationSchema } from '@/lib/domain/jsonld';
import { recipeInputSchema } from '@/lib/domain/recipe';
import { hasTrustedMutationOrigin, jsonError } from '@/lib/http';
import { createRecipe } from '@/lib/services/recipe-service';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

export async function POST(request: Request) {
  if (!hasTrustedMutationOrigin(request)) {
    return jsonError(
      403,
      'untrusted_origin',
      'This confirmation must come from a trusted app origin.',
    );
  }
  const actor = getActorContext((await cookies()).get(ACTIVE_PROFILE_COOKIE)?.value);
  if (!actor.profileId) {
    return jsonError(
      409,
      'profile_selection_required',
      'Choose a household profile before adding this reviewed recipe.',
    );
  }
  const body = jsonLdConfirmationSchema.safeParse(await request.json().catch(() => null));
  const recipe = body.success ? recipeInputSchema.safeParse(body.data.recipe) : undefined;
  if (!recipe?.success)
    return jsonError(400, 'invalid_recipe', 'Check the reviewed recipe details.');
  return NextResponse.json({ recipe: createRecipe(recipe.data, actor.profileId) }, { status: 201 });
}
