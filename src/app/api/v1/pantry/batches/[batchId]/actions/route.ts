import { NextResponse } from 'next/server';

import { pantryBatchActionSchema } from '@/lib/domain/pantry';
import { jsonError } from '@/lib/http';
import { applyPantryBatchAction } from '@/lib/services/pantry-service';

import {
  pantryServiceError,
  rejectUntrustedPantryMutation,
  requirePantryActor,
} from '../../../_shared';

export const runtime = 'nodejs';

export async function POST(request: Request, context: { params: Promise<{ batchId: string }> }) {
  const rejected = rejectUntrustedPantryMutation(request);
  if (rejected) return rejected;
  const actor = await requirePantryActor();
  if (actor.response) return actor.response;
  const parsed = pantryBatchActionSchema.safeParse(await request.json().catch(() => null));
  if (!parsed.success)
    return jsonError(400, 'invalid_pantry_action', 'Check the quantity and Pantry action.');
  try {
    return NextResponse.json({
      batch: applyPantryBatchAction((await context.params).batchId, parsed.data, actor.profileId),
    });
  } catch (error) {
    const response = pantryServiceError(error);
    if (response) return response;
    throw error;
  }
}
