import { cookies } from 'next/headers';
import { NextResponse } from 'next/server';

import { ACTIVE_PROFILE_COOKIE, getActorContext } from '@/lib/actor-context';
import { supermarketProfileInputSchema } from '@/lib/domain/list-settings';
import { hasTrustedMutationOrigin, jsonError } from '@/lib/http';
import {
  createSupermarketProfile,
  getListSettingsWorkspace,
  ListSettingsConflictError,
} from '@/lib/services/list-settings-service';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

export function GET() {
  return NextResponse.json(getListSettingsWorkspace());
}

export async function POST(request: Request) {
  if (!hasTrustedMutationOrigin(request))
    return jsonError(403, 'untrusted_origin', 'This change must come from a trusted app origin.');
  const actor = getActorContext((await cookies()).get(ACTIVE_PROFILE_COOKIE)?.value);
  if (!actor.profileId)
    return jsonError(409, 'profile_selection_required', 'Choose a household profile first.');
  const parsed = supermarketProfileInputSchema.safeParse(await request.json().catch(() => null));
  if (!parsed.success)
    return jsonError(400, 'invalid_supermarket_profile', 'Check the supermarket details.');
  try {
    return NextResponse.json(createSupermarketProfile(parsed.data, actor.profileId), {
      status: 201,
    });
  } catch (error) {
    if (error instanceof ListSettingsConflictError)
      return jsonError(409, 'supermarket_conflict', error.message);
    throw error;
  }
}
