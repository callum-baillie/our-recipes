import { withApiRequestId, authorizeCoreApi, actorFromPrincipal } from '@/lib/api-auth';

import { NextResponse } from 'next/server';

import { jsonError } from '@/lib/http';
import { PlanningNotFoundError, removeShoppingAisle } from '@/lib/services/planning-service';

export const runtime = 'nodejs';

export async function DELETE(request: Request, context: { params: Promise<{ aisleId: string }> }) {
  const access = await authorizeCoreApi(request);
  if (access.response) return access.response;

  const actor = actorFromPrincipal(access.principal);
  if (!actor.profileId)
    return withApiRequestId(
      jsonError(409, 'profile_selection_required', 'Choose a household profile first.'),
      access.requestId,
    );
  try {
    removeShoppingAisle((await context.params).aisleId);
    return withApiRequestId(new NextResponse(null, { status: 204 }), access.requestId);
  } catch (error) {
    if (error instanceof PlanningNotFoundError)
      return withApiRequestId(
        jsonError(404, 'shopping_aisle_not_found', error.message),
        access.requestId,
      );
    throw error;
  }
}
