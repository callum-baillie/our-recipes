import { NextResponse } from 'next/server';

import { pantryProductUpdateSchema } from '@/lib/domain/pantry';
import { jsonError } from '@/lib/http';
import { updatePantryProduct } from '@/lib/services/pantry-service';

import {
  pantryServiceError,
  rejectUntrustedPantryMutation,
  requirePantryActor,
} from '../../_shared';

export const runtime = 'nodejs';

export async function PATCH(request: Request, context: { params: Promise<{ productId: string }> }) {
  const rejected = rejectUntrustedPantryMutation(request);
  if (rejected) return rejected;
  const actor = await requirePantryActor();
  if (actor.response) return actor.response;
  const parsed = pantryProductUpdateSchema.safeParse(await request.json().catch(() => null));
  if (!parsed.success)
    return jsonError(
      400,
      'invalid_pantry_product',
      'Check the product name, units, and stock targets.',
    );
  try {
    return NextResponse.json({
      product: updatePantryProduct((await context.params).productId, parsed.data, actor.profileId),
    });
  } catch (error) {
    const response = pantryServiceError(error);
    if (response) return response;
    throw error;
  }
}
