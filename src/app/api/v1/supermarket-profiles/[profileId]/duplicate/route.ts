import { cookies } from 'next/headers';
import { NextResponse } from 'next/server';

import { ACTIVE_PROFILE_COOKIE, getActorContext } from '@/lib/actor-context';
import { hasTrustedMutationOrigin, jsonError } from '@/lib/http';
import {
  duplicateSupermarketProfile,
  ListSettingsConflictError,
  ListSettingsNotFoundError,
} from '@/lib/services/list-settings-service';

export const runtime = 'nodejs';

export async function POST(request: Request, context: { params: Promise<{ profileId: string }> }) {
  if (!hasTrustedMutationOrigin(request))
    return jsonError(403, 'untrusted_origin', 'This change must come from a trusted app origin.');
  const actor = getActorContext((await cookies()).get(ACTIVE_PROFILE_COOKIE)?.value);
  if (!actor.profileId)
    return jsonError(409, 'profile_selection_required', 'Choose a household profile first.');
  try {
    return NextResponse.json(
      duplicateSupermarketProfile((await context.params).profileId, actor.profileId),
      { status: 201 },
    );
  } catch (error) {
    if (error instanceof ListSettingsNotFoundError)
      return jsonError(404, 'supermarket_not_found', error.message);
    if (error instanceof ListSettingsConflictError)
      return jsonError(409, 'supermarket_conflict', error.message);
    throw error;
  }
}
