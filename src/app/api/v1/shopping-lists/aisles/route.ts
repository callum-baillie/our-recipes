import { cookies } from 'next/headers';
import { NextResponse } from 'next/server';

import { ACTIVE_PROFILE_COOKIE, getActorContext } from '@/lib/actor-context';
import { shoppingAisleOrderSchema, shoppingAisleSchema } from '@/lib/domain/planning';
import { hasTrustedMutationOrigin, jsonError } from '@/lib/http';
import {
  createShoppingAisle,
  listShoppingAisles,
  PlanningNotFoundError,
  reorderShoppingAisles,
} from '@/lib/services/planning-service';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

export function GET() {
  return NextResponse.json({ aisles: listShoppingAisles() });
}

async function requireActor(request: Request) {
  if (!hasTrustedMutationOrigin(request))
    return {
      error: jsonError(403, 'untrusted_origin', 'This change must come from a trusted app origin.'),
    };
  const actor = getActorContext((await cookies()).get(ACTIVE_PROFILE_COOKIE)?.value);
  return actor.profileId
    ? { actor }
    : { error: jsonError(409, 'profile_selection_required', 'Choose a household profile first.') };
}

export async function POST(request: Request) {
  const context = await requireActor(request);
  if ('error' in context) return context.error;
  const parsed = shoppingAisleSchema.safeParse(await request.json().catch(() => null));
  if (!parsed.success) return jsonError(400, 'invalid_shopping_aisle', 'Use a short aisle name.');
  try {
    return NextResponse.json({ aisle: createShoppingAisle(parsed.data) }, { status: 201 });
  } catch (error) {
    if (error instanceof PlanningNotFoundError)
      return jsonError(409, 'shopping_aisle_conflict', error.message);
    throw error;
  }
}

export async function PATCH(request: Request) {
  const context = await requireActor(request);
  if ('error' in context) return context.error;
  const parsed = shoppingAisleOrderSchema.safeParse(await request.json().catch(() => null));
  if (!parsed.success)
    return jsonError(400, 'invalid_aisle_order', 'Use the current set of aisles.');
  try {
    reorderShoppingAisles(parsed.data.aisleIds);
    return NextResponse.json({ aisles: listShoppingAisles() });
  } catch (error) {
    if (error instanceof PlanningNotFoundError)
      return jsonError(409, 'aisle_order_conflict', error.message);
    throw error;
  }
}
