import { withApiRequestId, authorizeCoreApi, actorFromPrincipal } from '@/lib/api-auth';
import { NextResponse } from 'next/server';

import { pantryLocationInputSchema } from '@/lib/domain/pantry';
import { jsonError } from '@/lib/http';
import { updatePantryLocation } from '@/lib/services/pantry-service';

import { pantryServiceError } from '../../_shared';

export const runtime = 'nodejs';

export async function PATCH(
  request: Request,
  context: { params: Promise<{ locationId: string }> },
) {
  const access = await authorizeCoreApi(request);
  if (access.response) return access.response;

  const actor = actorFromPrincipal(access.principal);

  const parsed = pantryLocationInputSchema.safeParse(await request.json().catch(() => null));
  if (!parsed.success)
    return withApiRequestId(
      jsonError(400, 'invalid_pantry_location', 'Check the location name and parent.'),
      access.requestId,
    );
  try {
    return withApiRequestId(
      NextResponse.json({
        location: updatePantryLocation(
          (await context.params).locationId,
          parsed.data,
          actor.profileId,
        ),
      }),
      access.requestId,
    );
  } catch (error) {
    const response = pantryServiceError(error);
    if (response) return withApiRequestId(response, access.requestId);
    throw error;
  }
}
