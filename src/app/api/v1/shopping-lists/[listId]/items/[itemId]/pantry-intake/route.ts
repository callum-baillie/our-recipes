import { cookies } from 'next/headers';
import { NextResponse } from 'next/server';

import { ACTIVE_PROFILE_COOKIE, getActorContext } from '@/lib/actor-context';
import { pantryPurchaseIntakeSchema } from '@/lib/domain/pantry-grocery-cooking';
import { hasTrustedMutationOrigin, jsonError } from '@/lib/http';
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
  if (!hasTrustedMutationOrigin(request))
    return jsonError(403, 'untrusted_origin', 'This change must come from a trusted app origin.');
  const actor = getActorContext((await cookies()).get(ACTIVE_PROFILE_COOKIE)?.value);
  if (!actor.profileId)
    return jsonError(409, 'profile_selection_required', 'Choose a household profile first.');
  const parsed = pantryPurchaseIntakeSchema.safeParse(await request.json().catch(() => null));
  if (!parsed.success)
    return jsonError(400, 'invalid_pantry_intake', 'Check the product, quantity, and location.');
  try {
    const { listId, itemId } = await context.params;
    const result = intakePurchasedShoppingItem(listId, itemId, parsed.data, actor.profileId);
    return NextResponse.json(result, { status: result.replayed ? 200 : 201 });
  } catch (error) {
    if (error instanceof PantryGroceryCookingNotFoundError || error instanceof PantryNotFoundError)
      return jsonError(404, 'pantry_intake_target_not_found', error.message);
    if (error instanceof PantryGroceryCookingConflictError)
      return jsonError(409, 'pantry_intake_conflict', error.message);
    if (error instanceof PantryValidationError)
      return jsonError(400, 'invalid_pantry_intake', error.message);
    throw error;
  }
}
