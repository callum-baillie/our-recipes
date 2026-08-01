import { NextResponse } from 'next/server';

import { authorizeApi, withApiRequestId } from '@/lib/api-auth';
import { recipeStatusSchema } from '@/lib/domain/recipe';
import { hasTrustedMutationOrigin, jsonError } from '@/lib/http';
import {
  RecipeConflictError,
  RecipeNotFoundError,
  updateRecipeStatusWithIntegrations,
} from '@/lib/services/recipe-service';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

export async function PATCH(request: Request, context: { params: Promise<{ recipeId: string }> }) {
  if (!hasTrustedMutationOrigin(request)) {
    return jsonError(403, 'untrusted_origin', 'This change must come from a trusted app origin.');
  }
  const authorization = await authorizeApi(request, 'recipes', 'update');
  if (authorization.response) return authorization.response;
  const parsed = recipeStatusSchema.safeParse(await request.json().catch(() => null));
  if (!parsed.success) return jsonError(400, 'invalid_recipe_status', 'Check the recipe status.');
  try {
    const result = updateRecipeStatusWithIntegrations(
      (await context.params).recipeId,
      parsed.data.status,
      authorization.principal.profileId,
      parsed.data.expectedRevision,
    );
    return withApiRequestId(NextResponse.json(result), authorization.requestId);
  } catch (error) {
    if (error instanceof RecipeNotFoundError)
      return jsonError(404, 'recipe_not_found', error.message);
    if (error instanceof RecipeConflictError)
      return jsonError(409, 'recipe_revision_conflict', error.message);
    throw error;
  }
}
