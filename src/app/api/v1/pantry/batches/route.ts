import { NextResponse } from 'next/server';

import { pantryBatchInputSchema, pantryQuerySchema } from '@/lib/domain/pantry';
import { jsonError } from '@/lib/http';
import { createPantryBatch, getPantryDashboard } from '@/lib/services/pantry-service';

import { pantryServiceError, rejectUntrustedPantryMutation, requirePantryActor } from '../_shared';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

export function GET(request: Request) {
  const parsed = pantryQuerySchema.safeParse(
    Object.fromEntries(new URL(request.url).searchParams.entries()),
  );
  if (!parsed.success) return jsonError(400, 'invalid_pantry_query', 'Use valid Pantry filters.');
  return NextResponse.json({ batches: getPantryDashboard(parsed.data).batches });
}

export async function POST(request: Request) {
  const rejected = rejectUntrustedPantryMutation(request);
  if (rejected) return rejected;
  const actor = await requirePantryActor();
  if (actor.response) return actor.response;
  const parsed = pantryBatchInputSchema.safeParse(await request.json().catch(() => null));
  if (!parsed.success)
    return jsonError(
      400,
      'invalid_pantry_batch',
      'Enter a product, location, and an exact or approximate quantity.',
    );
  try {
    return NextResponse.json(
      { batch: createPantryBatch(parsed.data, actor.profileId) },
      { status: 201 },
    );
  } catch (error) {
    const response = pantryServiceError(error);
    if (response) return response;
    throw error;
  }
}
