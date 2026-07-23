import { NextResponse } from 'next/server';

import { pantryLocationInputSchema } from '@/lib/domain/pantry';
import { jsonError } from '@/lib/http';
import { updatePantryLocation } from '@/lib/services/pantry-service';

import {
  pantryServiceError,
  rejectUntrustedPantryMutation,
  requirePantryActor,
} from '../../_shared';

export const runtime = 'nodejs';

export async function PATCH(
  request: Request,
  context: { params: Promise<{ locationId: string }> },
) {
  const rejected = rejectUntrustedPantryMutation(request);
  if (rejected) return rejected;
  const actor = await requirePantryActor();
  if (actor.response) return actor.response;
  const parsed = pantryLocationInputSchema.safeParse(await request.json().catch(() => null));
  if (!parsed.success)
    return jsonError(400, 'invalid_pantry_location', 'Check the location name and parent.');
  try {
    return NextResponse.json({
      location: updatePantryLocation(
        (await context.params).locationId,
        parsed.data,
        actor.profileId,
      ),
    });
  } catch (error) {
    const response = pantryServiceError(error);
    if (response) return response;
    throw error;
  }
}
