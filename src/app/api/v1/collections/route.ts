import { NextResponse } from 'next/server';

import { authorizeApi, requireTrustedSessionMutation, withApiRequestId } from '@/lib/api-auth';
import { idempotentJsonResponse, prepareIdempotentMutation } from '@/lib/api-idempotency';
import { collectionInputSchema } from '@/lib/domain/collection';
import { jsonError } from '@/lib/http';
import {
  CollectionConflictError,
  CollectionValidationError,
  createCollection,
  listCollections,
} from '@/lib/services/collection-service';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

export async function GET(request: Request) {
  const authorization = await authorizeApi(request, 'collections', 'read');
  if (authorization.response) return authorization.response;
  return withApiRequestId(
    NextResponse.json({ collections: listCollections() }),
    authorization.requestId,
  );
}

export async function POST(request: Request) {
  const authorization = await authorizeApi(request, 'collections', 'create');
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
  const parsed = collectionInputSchema.safeParse(idempotency.context.body);
  if (!parsed.success) return jsonError(400, 'invalid_collection', 'Check the collection details.');
  try {
    return idempotentJsonResponse(
      idempotency.context,
      {
        collection: createCollection(parsed.data, authorization.principal.profileId),
      },
      authorization.requestId,
      201,
    );
  } catch (error) {
    if (error instanceof CollectionConflictError)
      return jsonError(409, 'collection_conflict', error.message);
    if (error instanceof CollectionValidationError)
      return jsonError(400, 'invalid_collection_cover', error.message);
    throw error;
  }
}
