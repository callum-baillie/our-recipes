import { NextResponse } from 'next/server';

import { authorizeApi, requireTrustedSessionMutation, withApiRequestId } from '@/lib/api-auth';
import { pantryShoppingControlSchema } from '@/lib/domain/pantry-grocery-cooking';
import { jsonError } from '@/lib/http';
import {
  PantryGroceryCookingNotFoundError,
  updateShoppingPolicyForTrip,
} from '@/lib/services/pantry-grocery-cooking-service';

export const runtime = 'nodejs';

export async function PATCH(
  request: Request,
  context: { params: Promise<{ listId: string; productId: string }> },
) {
  const authorization = await authorizeApi(request, 'shoppingLists', 'update');
  if (authorization.response) return authorization.response;
  const originError = requireTrustedSessionMutation(
    request,
    authorization.principal,
    authorization.requestId,
  );
  if (originError) return originError;
  const parsed = pantryShoppingControlSchema.safeParse(await request.json().catch(() => null));
  if (
    !parsed.success ||
    !['skip_policy', 'restore_policy', 'assume_empty_for_trip'].includes(parsed.data.action)
  ) {
    return jsonError(400, 'invalid_policy_control', 'Use a supported per-trip policy action.');
  }
  const { listId, productId } = await context.params;
  try {
    const reviews = updateShoppingPolicyForTrip(
      listId,
      productId,
      parsed.data.action as 'skip_policy' | 'restore_policy' | 'assume_empty_for_trip',
      authorization.principal.profileId,
    );
    return withApiRequestId(NextResponse.json({ reviews }), authorization.requestId);
  } catch (error) {
    if (error instanceof PantryGroceryCookingNotFoundError) {
      return jsonError(404, 'policy_not_found', error.message);
    }
    throw error;
  }
}
