import { cookies } from 'next/headers';
import { NextResponse } from 'next/server';

import { ACTIVE_PROFILE_COOKIE, getActorContext } from '@/lib/actor-context';
import { supermarketProfileUpdateSchema } from '@/lib/domain/list-settings';
import { hasTrustedMutationOrigin, jsonError } from '@/lib/http';
import {
  ListSettingsConflictError,
  ListSettingsNotFoundError,
  updateSupermarketProfile,
} from '@/lib/services/list-settings-service';

export const runtime = 'nodejs';

export async function PATCH(request: Request, context: { params: Promise<{ profileId: string }> }) {
  if (!hasTrustedMutationOrigin(request))
    return jsonError(403, 'untrusted_origin', 'This change must come from a trusted app origin.');
  const actor = getActorContext((await cookies()).get(ACTIVE_PROFILE_COOKIE)?.value);
  if (!actor.profileId)
    return jsonError(409, 'profile_selection_required', 'Choose a household profile first.');
  const parsed = supermarketProfileUpdateSchema.safeParse(await request.json().catch(() => null));
  if (!parsed.success)
    return jsonError(400, 'invalid_supermarket_profile', 'Check the supermarket details.');
  try {
    return NextResponse.json(
      updateSupermarketProfile((await context.params).profileId, parsed.data, actor.profileId),
    );
  } catch (error) {
    if (error instanceof ListSettingsNotFoundError)
      return jsonError(404, 'supermarket_not_found', error.message);
    if (error instanceof ListSettingsConflictError)
      return jsonError(409, 'supermarket_conflict', error.message);
    throw error;
  }
}
