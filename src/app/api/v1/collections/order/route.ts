import { withApiRequestId, authorizeCoreApi, actorFromPrincipal } from '@/lib/api-auth';

import { NextResponse } from 'next/server';

import { collectionOrderSchema } from '@/lib/domain/collection';
import { jsonError } from '@/lib/http';
import { CollectionValidationError, reorderCollections } from '@/lib/services/collection-service';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

export async function POST(request: Request) {
  const access = await authorizeCoreApi(request);
  if (access.response) return access.response;

  const actor = actorFromPrincipal(access.principal);
  if (!actor.profileId) {
    return withApiRequestId(
      jsonError(409, 'profile_selection_required', 'Choose a household profile first.'),
      access.requestId,
    );
  }
  const parsed = collectionOrderSchema.safeParse(await request.json().catch(() => null));
  if (!parsed.success)
    return withApiRequestId(
      jsonError(400, 'invalid_collection_order', 'Check the collection order.'),
      access.requestId,
    );
  try {
    return withApiRequestId(
      NextResponse.json({
        collections: reorderCollections(parsed.data.collectionIds, actor.profileId),
      }),
      access.requestId,
    );
  } catch (error) {
    if (error instanceof CollectionValidationError)
      return withApiRequestId(
        jsonError(409, 'stale_collection_order', error.message),
        access.requestId,
      );
    throw error;
  }
}
