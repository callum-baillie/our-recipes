import { NextResponse } from 'next/server';

import { authorizeApi, requireTrustedSessionMutation, withApiRequestId } from '@/lib/api-auth';
import { pantryShoppingMatchSchema } from '@/lib/domain/pantry-grocery-cooking';
import { jsonError } from '@/lib/http';
import {
  matchShoppingItemToPantryProduct,
  PantryGroceryCookingNotFoundError,
} from '@/lib/services/pantry-grocery-cooking-service';

export const runtime = 'nodejs';

export async function PATCH(
  request: Request,
  context: { params: Promise<{ listId: string; itemId: string }> },
) {
  const authorization = await authorizeApi(request, 'shoppingLists', 'update');
  if (authorization.response) return authorization.response;
  const originError = requireTrustedSessionMutation(
    request,
    authorization.principal,
    authorization.requestId,
  );
  if (originError) return originError;
  if (!authorization.principal.profileId)
    return jsonError(409, 'profile_selection_required', 'Choose a household profile first.');
  const parsed = pantryShoppingMatchSchema.safeParse(await request.json().catch(() => null));
  if (!parsed.success)
    return jsonError(400, 'invalid_pantry_match', 'Choose a valid Pantry item match.');
  const { listId, itemId } = await context.params;
  try {
    const detail = matchShoppingItemToPantryProduct(
      listId,
      itemId,
      parsed.data,
      authorization.principal.profileId,
    );
    return withApiRequestId(NextResponse.json({ detail }), authorization.requestId);
  } catch (error) {
    if (error instanceof PantryGroceryCookingNotFoundError)
      return jsonError(404, 'pantry_match_not_found', error.message);
    throw error;
  }
}
