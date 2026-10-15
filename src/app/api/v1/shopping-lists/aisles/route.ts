import { withApiRequestId, authorizeCoreApi } from '@/lib/api-auth';

import { NextResponse } from 'next/server';

import { shoppingAisleOrderSchema, shoppingAisleSchema } from '@/lib/domain/planning';
import { jsonError } from '@/lib/http';
import {
  createShoppingAisle,
  listShoppingAisles,
  PlanningNotFoundError,
  reorderShoppingAisles,
} from '@/lib/services/planning-service';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

export async function GET(request: Request) {
  const access = await authorizeCoreApi(request);
  if (access.response) return access.response;

  return withApiRequestId(NextResponse.json({ aisles: listShoppingAisles() }), access.requestId);
}

export async function POST(request: Request) {
  const access = await authorizeCoreApi(request);
  if (access.response) return access.response;

  const parsed = shoppingAisleSchema.safeParse(await request.json().catch(() => null));
  if (!parsed.success)
    return withApiRequestId(
      jsonError(400, 'invalid_shopping_aisle', 'Use a short aisle name.'),
      access.requestId,
    );
  try {
    return withApiRequestId(
      NextResponse.json({ aisle: createShoppingAisle(parsed.data) }, { status: 201 }),
      access.requestId,
    );
  } catch (error) {
    if (error instanceof PlanningNotFoundError)
      return withApiRequestId(
        jsonError(409, 'shopping_aisle_conflict', error.message),
        access.requestId,
      );
    throw error;
  }
}

export async function PATCH(request: Request) {
  const access = await authorizeCoreApi(request);
  if (access.response) return access.response;

  const parsed = shoppingAisleOrderSchema.safeParse(await request.json().catch(() => null));
  if (!parsed.success)
    return withApiRequestId(
      jsonError(400, 'invalid_aisle_order', 'Use the current set of aisles.'),
      access.requestId,
    );
  try {
    reorderShoppingAisles(parsed.data.aisleIds);
    return withApiRequestId(NextResponse.json({ aisles: listShoppingAisles() }), access.requestId);
  } catch (error) {
    if (error instanceof PlanningNotFoundError)
      return withApiRequestId(
        jsonError(409, 'aisle_order_conflict', error.message),
        access.requestId,
      );
    throw error;
  }
}
