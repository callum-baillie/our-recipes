import { NextResponse } from 'next/server';

import { authorizeApi, requireTrustedSessionMutation, withApiRequestId } from '@/lib/api-auth';
import { shoppingListItemSchema } from '@/lib/domain/planning';
import { jsonError } from '@/lib/http';
import {
  PlanningNotFoundError,
  removeShoppingListItem,
  updateShoppingListItem,
} from '@/lib/services/planning-service';

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
  const parsed = shoppingListItemSchema.safeParse(await request.json().catch(() => null));
  if (!parsed.success)
    return jsonError(400, 'invalid_list_item', 'Check the shopping item details.');
  try {
    const { listId, itemId } = await context.params;
    updateShoppingListItem(listId, itemId, parsed.data, authorization.principal.profileId);
    return withApiRequestId(NextResponse.json({ ok: true }), authorization.requestId);
  } catch (error) {
    if (error instanceof PlanningNotFoundError)
      return jsonError(404, 'shopping_item_not_found', error.message);
    throw error;
  }
}

export async function DELETE(
  request: Request,
  context: { params: Promise<{ listId: string; itemId: string }> },
) {
  const authorization = await authorizeApi(request, 'shoppingLists', 'delete');
  if (authorization.response) return authorization.response;
  const originError = requireTrustedSessionMutation(
    request,
    authorization.principal,
    authorization.requestId,
  );
  if (originError) return originError;
  try {
    const { listId, itemId } = await context.params;
    removeShoppingListItem(listId, itemId);
    return withApiRequestId(new NextResponse(null, { status: 204 }), authorization.requestId);
  } catch (error) {
    if (error instanceof PlanningNotFoundError)
      return jsonError(404, 'shopping_item_not_found', error.message);
    throw error;
  }
}
