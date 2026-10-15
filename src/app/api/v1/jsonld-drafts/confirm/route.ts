import { withApiRequestId, authorizeCoreApi, actorFromPrincipal } from '@/lib/api-auth';

import { NextResponse } from 'next/server';

import { jsonLdConfirmationSchema } from '@/lib/domain/jsonld';
import { recipeInputSchema } from '@/lib/domain/recipe';
import { jsonError } from '@/lib/http';
import { createRecipe } from '@/lib/services/recipe-service';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

export async function POST(request: Request) {
  const access = await authorizeCoreApi(request);
  if (access.response) return access.response;

  const actor = actorFromPrincipal(access.principal);
  if (!actor.profileId) {
    return withApiRequestId(
      jsonError(
        409,
        'profile_selection_required',
        'Choose a household profile before adding this reviewed recipe.',
      ),
      access.requestId,
    );
  }
  const body = jsonLdConfirmationSchema.safeParse(await request.json().catch(() => null));
  const recipe = body.success ? recipeInputSchema.safeParse(body.data.recipe) : undefined;
  if (!recipe?.success)
    return withApiRequestId(
      jsonError(400, 'invalid_recipe', 'Check the reviewed recipe details.'),
      access.requestId,
    );
  return withApiRequestId(
    NextResponse.json({ recipe: createRecipe(recipe.data, actor.profileId) }, { status: 201 }),
    access.requestId,
  );
}
