import { NextResponse } from 'next/server';

import { authorizeApi, requireTrustedSessionMutation, withApiRequestId } from '@/lib/api-auth';
import { collectionInputSchema } from '@/lib/domain/collection';
import { jsonError } from '@/lib/http';
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
  request: Request,
  context: { params: Promise<{ collectionId: string }> },
) {
  const authorization = await authorizeApi(request, 'collections', 'read');
  if (authorization.response) return authorization.response;
  const { collectionId } = await context.params;
  const collection = getCollection(collectionId);
  return collection
    ? withApiRequestId(NextResponse.json({ collection }), authorization.requestId)
    : jsonError(404, 'collection_not_found', 'That collection no longer exists.');
}

export async function PATCH(
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
  const parsed = collectionInputSchema.safeParse(await request.json().catch(() => null));
  if (!parsed.success) return jsonError(400, 'invalid_collection', 'Check the collection details.');
  try {
    const { collectionId } = await context.params;
    return withApiRequestId(
      NextResponse.json({
        collection: updateCollection(collectionId, parsed.data, authorization.principal.profileId),
      }),
      authorization.requestId,
    );
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
  const authorization = await authorizeApi(request, 'collections', 'delete');
  if (authorization.response) return authorization.response;
  const originError = requireTrustedSessionMutation(
    request,
    authorization.principal,
    authorization.requestId,
  );
  if (originError) return originError;
  try {
    const { collectionId } = await context.params;
    deleteCollection(collectionId);
    return withApiRequestId(new NextResponse(null, { status: 204 }), authorization.requestId);
  } catch (error) {
    if (error instanceof CollectionNotFoundError)
      return jsonError(404, 'collection_not_found', error.message);
    throw error;
  }
}
