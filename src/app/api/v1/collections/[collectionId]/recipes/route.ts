import { cookies } from 'next/headers';
import { NextResponse } from 'next/server';

import { ACTIVE_PROFILE_COOKIE, getActorContext } from '@/lib/actor-context';
import { collectionRecipeSchema, collectionRecipesSchema } from '@/lib/domain/collection';
import { hasTrustedMutationOrigin, jsonError } from '@/lib/http';
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
  if (!hasTrustedMutationOrigin(request)) {
    return jsonError(403, 'untrusted_origin', 'This change must come from a trusted app origin.');
  }
  const actor = getActorContext((await cookies()).get(ACTIVE_PROFILE_COOKIE)?.value);
  if (!actor.profileId) {
    return jsonError(
      409,
      'profile_selection_required',
      'Choose a household profile before organizing recipes.',
    );
  }
  const parsed = collectionRecipeSchema.safeParse(await request.json().catch(() => null));
  if (!parsed.success)
    return jsonError(400, 'invalid_collection_recipe', 'Choose a valid recipe to add.');
  try {
    const { collectionId } = await context.params;
    const result = addRecipeToCollection(collectionId, parsed.data.recipeId, actor.profileId);
    return NextResponse.json(result, { status: result.added ? 201 : 200 });
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
  if (!hasTrustedMutationOrigin(request)) {
    return jsonError(403, 'untrusted_origin', 'This change must come from a trusted app origin.');
  }
  const actor = getActorContext((await cookies()).get(ACTIVE_PROFILE_COOKIE)?.value);
  if (!actor.profileId) {
    return jsonError(
      409,
      'profile_selection_required',
      'Choose a household profile before organizing recipes.',
    );
  }
  const parsed = collectionRecipesSchema.safeParse(await request.json().catch(() => null));
  if (!parsed.success)
    return jsonError(400, 'invalid_collection_recipes', 'Check the collection recipes.');
  try {
    const { collectionId } = await context.params;
    return NextResponse.json({
      collection: replaceCollectionRecipes(collectionId, parsed.data.recipeIds, actor.profileId),
    });
  } catch (error) {
    if (error instanceof CollectionNotFoundError)
      return jsonError(404, 'collection_not_found', error.message);
    if (error instanceof CollectionValidationError)
      return jsonError(400, 'invalid_collection_recipes', error.message);
    throw error;
  }
}
