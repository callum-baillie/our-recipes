import { NextResponse } from 'next/server';

import { authorizeApi, requireTrustedSessionMutation, withApiRequestId } from '@/lib/api-auth';
import { idempotentJsonResponse, prepareIdempotentMutation } from '@/lib/api-idempotency';
import { recipeInputSchema, recipeLibraryQuerySchema } from '@/lib/domain/recipe';
import { jsonError } from '@/lib/http';
import { createRecipe, listRecipeLibrary } from '@/lib/services/recipe-service';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

export async function GET(request: Request) {
  const authorization = await authorizeApi(request, 'recipes', 'read');
  if (authorization.response) return authorization.response;
  const parsed = recipeLibraryQuerySchema.safeParse(
    Object.fromEntries(new URL(request.url).searchParams.entries()),
  );
  if (!parsed.success) return jsonError(400, 'invalid_recipe_query', 'Check the recipe filters.');
  return withApiRequestId(
    NextResponse.json({
      library: listRecipeLibrary(parsed.data, authorization.principal.profileId),
    }),
    authorization.requestId,
  );
}

export async function POST(request: Request) {
  const authorization = await authorizeApi(request, 'recipes', 'create');
  if (authorization.response) return authorization.response;
  const originError = requireTrustedSessionMutation(
    request,
    authorization.principal,
    authorization.requestId,
  );
  if (originError) return originError;
  const idempotency = await prepareIdempotentMutation(
    request,
    authorization.principal,
    authorization.requestId,
  );
  if (idempotency.response) return idempotency.response;
  const parsed = recipeInputSchema.safeParse(idempotency.context.body);
  if (!parsed.success)
    return jsonError(400, 'invalid_recipe', 'Check the highlighted recipe details.');
  const recipe = createRecipe(parsed.data, authorization.principal.profileId);
  return idempotentJsonResponse(idempotency.context, { recipe }, authorization.requestId, 201);
}
