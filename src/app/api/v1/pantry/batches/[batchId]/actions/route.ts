import { withApiRequestId, authorizeCoreApi, actorFromPrincipal } from '@/lib/api-auth';
import { NextResponse } from 'next/server';

import { pantryBatchActionSchema } from '@/lib/domain/pantry';
import { jsonError } from '@/lib/http';
import { applyPantryBatchAction } from '@/lib/services/pantry-service';
import { reconcileAutomaticRestockPolicies } from '@/lib/services/pantry-grocery-cooking-service';

import { pantryServiceError } from '../../../_shared';

export const runtime = 'nodejs';

export async function POST(request: Request, context: { params: Promise<{ batchId: string }> }) {
  const access = await authorizeCoreApi(request);
  if (access.response) return access.response;

  const actor = actorFromPrincipal(access.principal);

  const parsed = pantryBatchActionSchema.safeParse(await request.json().catch(() => null));
  if (!parsed.success)
    return withApiRequestId(
      jsonError(400, 'invalid_pantry_action', 'Check the quantity and Pantry action.'),
      access.requestId,
    );
  try {
    const batch = applyPantryBatchAction(
      (await context.params).batchId,
      parsed.data,
      actor.profileId,
    );
    reconcileAutomaticRestockPolicies(actor.profileId);
    return withApiRequestId(
      NextResponse.json({
        batch,
      }),
      access.requestId,
    );
  } catch (error) {
    const response = pantryServiceError(error);
    if (response) return withApiRequestId(response, access.requestId);
    throw error;
  }
}
