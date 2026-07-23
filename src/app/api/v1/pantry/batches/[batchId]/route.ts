import { NextResponse } from 'next/server';

import { pantryBatchUpdateSchema } from '@/lib/domain/pantry';
import { jsonError } from '@/lib/http';
import { updatePantryBatch } from '@/lib/services/pantry-service';

import {
  pantryServiceError,
  rejectUntrustedPantryMutation,
  requirePantryActor,
} from '../../_shared';

export const runtime = 'nodejs';

export async function PATCH(request: Request, context: { params: Promise<{ batchId: string }> }) {
  const rejected = rejectUntrustedPantryMutation(request);
  if (rejected) return rejected;
  const actor = await requirePantryActor();
  if (actor.response) return actor.response;
  const parsed = pantryBatchUpdateSchema.safeParse(await request.json().catch(() => null));
  if (!parsed.success)
    return jsonError(400, 'invalid_pantry_batch', 'Check the Pantry item details and try again.');
  try {
    return NextResponse.json({
      batch: updatePantryBatch((await context.params).batchId, parsed.data, actor.profileId),
    });
  } catch (error) {
    const response = pantryServiceError(error);
    if (response) return response;
    throw error;
  }
}
