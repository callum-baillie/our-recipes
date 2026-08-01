import { NextResponse } from 'next/server';

import { authorizeApi, requireTrustedSessionMutation, withApiRequestId } from '@/lib/api-auth';
import { recipeUpdateInputSchema } from '@/lib/domain/recipe';
import { jsonError } from '@/lib/http';
import {
  getRecipe,
  RecipeConflictError,
  RecipeNotFoundError,
  updateRecipeWithIntegrations,
  updateRecipeStatusWithIntegrations,
} from '@/lib/services/recipe-service';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

export async function GET(request: Request, context: { params: Promise<{ recipeId: string }> }) {
  const authorization = await authorizeApi(request, 'recipes', 'read');
  if (authorization.response) return authorization.response;
  const { recipeId } = await context.params;
  const recipe = getRecipe(recipeId, authorization.principal.profileId);
  return recipe
    ? withApiRequestId(NextResponse.json({ recipe }), authorization.requestId)
    : jsonError(404, 'recipe_not_found', 'That recipe no longer exists.');
}

export async function PUT(request: Request, context: { params: Promise<{ recipeId: string }> }) {
  const authorization = await authorizeApi(request, 'recipes', 'update');
  if (authorization.response) return authorization.response;
  const originError = requireTrustedSessionMutation(
    request,
    authorization.principal,
    authorization.requestId,
  );
  if (originError) return originError;
  const parsed = recipeUpdateInputSchema.safeParse(await request.json().catch(() => null));
  if (!parsed.success)
    return jsonError(400, 'invalid_recipe', 'Check the highlighted recipe details.');
  try {
    const { recipeId } = await context.params;
    const result = updateRecipeWithIntegrations(
      recipeId,
      parsed.data,
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

export async function DELETE(request: Request, context: { params: Promise<{ recipeId: string }> }) {
  const authorization = await authorizeApi(request, 'recipes', 'delete');
  if (authorization.response) return authorization.response;
  const originError = requireTrustedSessionMutation(
    request,
    authorization.principal,
    authorization.requestId,
  );
  if (originError) return originError;
  const expectedRevision = Number(new URL(request.url).searchParams.get('expectedRevision'));
  if (!Number.isInteger(expectedRevision) || expectedRevision < 1) {
    return jsonError(
      400,
      'expected_revision_required',
      'Provide the current expectedRevision before moving a recipe to trash.',
    );
  }
  try {
    const result = updateRecipeStatusWithIntegrations(
      (await context.params).recipeId,
      'trash',
      authorization.principal.profileId,
      expectedRevision,
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
