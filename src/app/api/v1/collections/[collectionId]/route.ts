import { cookies } from 'next/headers';
import { NextResponse } from 'next/server';

import { ACTIVE_PROFILE_COOKIE, getActorContext } from '@/lib/actor-context';
import { collectionInputSchema } from '@/lib/domain/collection';
import { hasTrustedMutationOrigin, jsonError } from '@/lib/http';
import {
  CollectionConflictError,
  CollectionNotFoundError,
  CollectionValidationError,
  deleteCollection,
  getCollection,
  updateCollection,
} from '@/lib/services/collection-service';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

export async function GET(
  _request: Request,
  context: { params: Promise<{ collectionId: string }> },
) {
  const { collectionId } = await context.params;
  const collection = getCollection(collectionId);
  return collection
    ? NextResponse.json({ collection })
    : jsonError(404, 'collection_not_found', 'That collection no longer exists.');
}

export async function PATCH(
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
      'Choose a household profile before editing a collection.',
    );
  }
  const parsed = collectionInputSchema.safeParse(await request.json().catch(() => null));
  if (!parsed.success) return jsonError(400, 'invalid_collection', 'Check the collection details.');
  try {
    const { collectionId } = await context.params;
    return NextResponse.json({
      collection: updateCollection(collectionId, parsed.data, actor.profileId),
    });
  } catch (error) {
    if (error instanceof CollectionNotFoundError)
      return jsonError(404, 'collection_not_found', error.message);
    if (error instanceof CollectionConflictError)
      return jsonError(409, 'collection_conflict', error.message);
    if (error instanceof CollectionValidationError)
      return jsonError(400, 'invalid_collection_cover', error.message);
    throw error;
  }
}

export async function DELETE(
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
      'Choose a household profile before removing a collection.',
    );
  }
  try {
    const { collectionId } = await context.params;
    deleteCollection(collectionId);
    return new NextResponse(null, { status: 204 });
  } catch (error) {
    if (error instanceof CollectionNotFoundError)
      return jsonError(404, 'collection_not_found', error.message);
    throw error;
  }
}
