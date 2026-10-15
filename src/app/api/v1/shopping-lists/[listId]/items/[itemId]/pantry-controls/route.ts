import { authorizeApi, requireTrustedSessionMutation, withApiRequestId } from '@/lib/api-auth';
import { NextResponse } from 'next/server';
import { pantryShoppingControlSchema } from '@/lib/domain/pantry-grocery-cooking';
import { jsonError } from '@/lib/http';
import {
  PantryGroceryCookingNotFoundError,
  updateShoppingItemPantryControl,
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
  const parsed = pantryShoppingControlSchema.safeParse(await request.json().catch(() => null));
  if (!parsed.success)
    return jsonError(400, 'invalid_pantry_control', 'Check the Pantry grocery control.');
  const { listId, itemId } = await context.params;
  try {
    return withApiRequestId(
      NextResponse.json({
        detail: updateShoppingItemPantryControl(
          listId,
          itemId,
          parsed.data,
          authorization.principal.profileId,
        ),
      }),
      authorization.requestId,
    );
  } catch (error) {
    if (error instanceof PantryGroceryCookingNotFoundError)
      return jsonError(404, 'pantry_control_not_found', error.message);
    throw error;
  }
}
