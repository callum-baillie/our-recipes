import { cookies } from 'next/headers';
import { NextResponse } from 'next/server';

import { ACTIVE_PROFILE_COOKIE, getActorContext } from '@/lib/actor-context';
import { hasTrustedMutationOrigin, jsonError } from '@/lib/http';
import { PlanningNotFoundError, removeShoppingAisle } from '@/lib/services/planning-service';

export const runtime = 'nodejs';

export async function DELETE(request: Request, context: { params: Promise<{ aisleId: string }> }) {
  if (!hasTrustedMutationOrigin(request))
    return jsonError(403, 'untrusted_origin', 'This change must come from a trusted app origin.');
  const actor = getActorContext((await cookies()).get(ACTIVE_PROFILE_COOKIE)?.value);
  if (!actor.profileId)
    return jsonError(409, 'profile_selection_required', 'Choose a household profile first.');
  try {
    removeShoppingAisle((await context.params).aisleId);
    return new NextResponse(null, { status: 204 });
  } catch (error) {
    if (error instanceof PlanningNotFoundError)
      return jsonError(404, 'shopping_aisle_not_found', error.message);
    throw error;
  }
}
