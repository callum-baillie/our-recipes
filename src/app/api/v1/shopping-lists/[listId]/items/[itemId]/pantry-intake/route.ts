import { withApiRequestId, authorizeCoreApi, actorFromPrincipal } from '@/lib/api-auth';

import { NextResponse } from 'next/server';

import { pantryPurchaseIntakeSchema } from '@/lib/domain/pantry-grocery-cooking';
import { jsonError } from '@/lib/http';
import {
  intakePurchasedShoppingItem,
  PantryGroceryCookingConflictError,
  PantryGroceryCookingNotFoundError,
} from '@/lib/services/pantry-grocery-cooking-service';
import { PantryNotFoundError, PantryValidationError } from '@/lib/services/pantry-service';

export const runtime = 'nodejs';

export async function POST(
  request: Request,
  context: { params: Promise<{ listId: string; itemId: string }> },
) {
  const access = await authorizeCoreApi(request);
  if (access.response) return access.response;

  const actor = actorFromPrincipal(access.principal);
  if (!actor.profileId)
    return withApiRequestId(
      jsonError(409, 'profile_selection_required', 'Choose a household profile first.'),
      access.requestId,
    );
  const parsed = pantryPurchaseIntakeSchema.safeParse(await request.json().catch(() => null));
  if (!parsed.success)
    return withApiRequestId(
      jsonError(400, 'invalid_pantry_intake', 'Check the product, quantity, and location.'),
      access.requestId,
    );
  try {
    const { listId, itemId } = await context.params;
    const result = intakePurchasedShoppingItem(listId, itemId, parsed.data, actor.profileId);
    return withApiRequestId(
      NextResponse.json(result, { status: result.replayed ? 200 : 201 }),
      access.requestId,
    );
  } catch (error) {
    if (error instanceof PantryGroceryCookingNotFoundError || error instanceof PantryNotFoundError)
      return withApiRequestId(
        jsonError(404, 'pantry_intake_target_not_found', error.message),
        access.requestId,
      );
    if (error instanceof PantryGroceryCookingConflictError)
      return withApiRequestId(
        jsonError(409, 'pantry_intake_conflict', error.message),
        access.requestId,
      );
    if (error instanceof PantryValidationError)
      return withApiRequestId(
        jsonError(400, 'invalid_pantry_intake', error.message),
        access.requestId,
      );
    throw error;
  }
}
