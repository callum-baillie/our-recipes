import { cookies } from 'next/headers';
import { NextResponse } from 'next/server';

import { ACTIVE_PROFILE_COOKIE, getActorContext } from '@/lib/actor-context';
import { collectionInputSchema } from '@/lib/domain/collection';
import { hasTrustedMutationOrigin, jsonError } from '@/lib/http';
import {
  CollectionConflictError,
  CollectionValidationError,
  createCollection,
  listCollections,
} from '@/lib/services/collection-service';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

export function GET() {
  return NextResponse.json({ collections: listCollections() });
}

export async function POST(request: Request) {
  if (!hasTrustedMutationOrigin(request)) {
    return jsonError(403, 'untrusted_origin', 'This change must come from a trusted app origin.');
  }
  const actor = getActorContext((await cookies()).get(ACTIVE_PROFILE_COOKIE)?.value);
  if (!actor.profileId) {
    return jsonError(
      409,
      'profile_selection_required',
      'Choose a household profile before creating a collection.',
    );
  }
  const parsed = collectionInputSchema.safeParse(await request.json().catch(() => null));
  if (!parsed.success) return jsonError(400, 'invalid_collection', 'Check the collection details.');
  try {
    return NextResponse.json(
      { collection: createCollection(parsed.data, actor.profileId) },
      { status: 201 },
    );
  } catch (error) {
    if (error instanceof CollectionConflictError)
      return jsonError(409, 'collection_conflict', error.message);
    if (error instanceof CollectionValidationError)
      return jsonError(400, 'invalid_collection_cover', error.message);
    throw error;
  }
}
