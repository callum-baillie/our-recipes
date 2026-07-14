import { cookies } from 'next/headers';
import { NextResponse } from 'next/server';

import { ACTIVE_PROFILE_COOKIE, getActorContext } from '@/lib/actor-context';
import { collectionOrderSchema } from '@/lib/domain/collection';
import { hasTrustedMutationOrigin, jsonError } from '@/lib/http';
import { CollectionValidationError, reorderCollections } from '@/lib/services/collection-service';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

export async function POST(request: Request) {
  if (!hasTrustedMutationOrigin(request)) {
    return jsonError(403, 'untrusted_origin', 'This change must come from a trusted app origin.');
  }
  const actor = getActorContext((await cookies()).get(ACTIVE_PROFILE_COOKIE)?.value);
  if (!actor.profileId) {
    return jsonError(409, 'profile_selection_required', 'Choose a household profile first.');
  }
  const parsed = collectionOrderSchema.safeParse(await request.json().catch(() => null));
  if (!parsed.success)
    return jsonError(400, 'invalid_collection_order', 'Check the collection order.');
  try {
    return NextResponse.json({
      collections: reorderCollections(parsed.data.collectionIds, actor.profileId),
    });
  } catch (error) {
    if (error instanceof CollectionValidationError)
      return jsonError(409, 'stale_collection_order', error.message);
    throw error;
  }
}
