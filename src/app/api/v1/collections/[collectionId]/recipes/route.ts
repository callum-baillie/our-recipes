import { NextResponse } from 'next/server';

import { authorizeApi, requireTrustedSessionMutation, withApiRequestId } from '@/lib/api-auth';
import { collectionRecipeSchema, collectionRecipesSchema } from '@/lib/domain/collection';
import { jsonError } from '@/lib/http';
import {
  addRecipeToCollection,
  CollectionNotFoundError,
  CollectionValidationError,
  replaceCollectionRecipes,
} from '@/lib/services/collection-service';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

export async function POST(
  request: Request,
  context: { params: Promise<{ collectionId: string }> },
) {
  const authorization = await authorizeApi(request, 'collections', 'create');
  if (authorization.response) return authorization.response;
  const originError = requireTrustedSessionMutation(
    request,
    authorization.principal,
    authorization.requestId,
  );
  if (originError) return originError;
  const parsed = collectionRecipeSchema.safeParse(await request.json().catch(() => null));
  if (!parsed.success)
    return jsonError(400, 'invalid_collection_recipe', 'Choose a valid recipe to add.');
  try {
    const { collectionId } = await context.params;
    const result = addRecipeToCollection(
      collectionId,
      parsed.data.recipeId,
      authorization.principal.profileId,
    );
    return withApiRequestId(
      NextResponse.json(result, { status: result.added ? 201 : 200 }),
      authorization.requestId,
    );
  } catch (error) {
    if (error instanceof CollectionNotFoundError)
      return jsonError(404, 'collection_not_found', error.message);
    if (error instanceof CollectionValidationError)
      return jsonError(400, 'invalid_collection_recipe', error.message);
    throw error;
  }
}

export async function PUT(
  request: Request,
  context: { params: Promise<{ collectionId: string }> },
) {
  const authorization = await authorizeApi(request, 'collections', 'update');
  if (authorization.response) return authorization.response;
  const originError = requireTrustedSessionMutation(
    request,
    authorization.principal,
    authorization.requestId,
  );
  if (originError) return originError;
  const parsed = collectionRecipesSchema.safeParse(await request.json().catch(() => null));
  if (!parsed.success)
    return jsonError(400, 'invalid_collection_recipes', 'Check the collection recipes.');
  try {
    const { collectionId } = await context.params;
    return withApiRequestId(
      NextResponse.json({
        collection: replaceCollectionRecipes(
          collectionId,
          parsed.data.recipeIds,
          authorization.principal.profileId,
        ),
      }),
      authorization.requestId,
    );
  } catch (error) {
    if (error instanceof CollectionNotFoundError)
      return jsonError(404, 'collection_not_found', error.message);
    if (error instanceof CollectionValidationError)
      return jsonError(400, 'invalid_collection_recipes', error.message);
    throw error;
  }
}
