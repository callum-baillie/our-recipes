import { NextResponse } from 'next/server';

import { pantryProductInputSchema } from '@/lib/domain/pantry';
import { jsonError } from '@/lib/http';
import { createPantryProduct, listPantryProducts } from '@/lib/services/pantry-service';

import { pantryServiceError, rejectUntrustedPantryMutation, requirePantryActor } from '../_shared';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

export function GET(request: Request) {
  const includeArchived = new URL(request.url).searchParams.get('includeArchived') === 'true';
  return NextResponse.json({ products: listPantryProducts(includeArchived) });
}

export async function POST(request: Request) {
  const rejected = rejectUntrustedPantryMutation(request);
  if (rejected) return rejected;
  const actor = await requirePantryActor();
  if (actor.response) return actor.response;
  const parsed = pantryProductInputSchema.safeParse(await request.json().catch(() => null));
  if (!parsed.success)
    return jsonError(
      400,
      'invalid_pantry_product',
      'Check the product name, units, and stock targets.',
    );
  try {
    return NextResponse.json(
      { product: createPantryProduct(parsed.data, actor.profileId) },
      { status: 201 },
    );
  } catch (error) {
    const response = pantryServiceError(error);
    if (response) return response;
    throw error;
  }
}
