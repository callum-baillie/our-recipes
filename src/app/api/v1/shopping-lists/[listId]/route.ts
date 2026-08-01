import { NextResponse } from 'next/server';

import { authorizeApi, requireTrustedSessionMutation, withApiRequestId } from '@/lib/api-auth';
import { shoppingListManageSchema, shoppingListReorderSchema } from '@/lib/domain/planning';
import { jsonError } from '@/lib/http';
import {
  getShoppingList,
  deleteShoppingList,
  manageShoppingList,
  PlanningNotFoundError,
  reorderShoppingListItems,
} from '@/lib/services/planning-service';

export const runtime = 'nodejs';

export async function GET(request: Request, context: { params: Promise<{ listId: string }> }) {
  const authorization = await authorizeApi(request, 'shoppingLists', 'read');
  if (authorization.response) return authorization.response;
  const list = getShoppingList((await context.params).listId);
  return list
    ? withApiRequestId(NextResponse.json({ list }), authorization.requestId)
    : jsonError(404, 'shopping_list_not_found', 'That shopping list no longer exists.');
}

export async function PATCH(request: Request, context: { params: Promise<{ listId: string }> }) {
  const authorization = await authorizeApi(request, 'shoppingLists', 'update');
  if (authorization.response) return authorization.response;
  const originError = requireTrustedSessionMutation(
    request,
    authorization.principal,
    authorization.requestId,
  );
  if (originError) return originError;
  const raw = await request.json().catch(() => null);
  const managed = shoppingListManageSchema.safeParse(raw);
  if (managed.success) {
    try {
      return withApiRequestId(
        NextResponse.json({
          list: manageShoppingList(
            (await context.params).listId,
            managed.data,
            authorization.principal.profileId,
          ),
        }),
        authorization.requestId,
      );
    } catch (error) {
      if (error instanceof PlanningNotFoundError)
        return jsonError(409, 'list_changed', error.message);
      throw error;
    }
  }
  const parsed = shoppingListReorderSchema.safeParse(raw);
  if (!parsed.success) return jsonError(400, 'invalid_list_change', 'Use a supported list change.');
  try {
    reorderShoppingListItems((await context.params).listId, parsed.data.itemIds);
    return withApiRequestId(NextResponse.json({ ok: true }), authorization.requestId);
  } catch (error) {
    if (error instanceof PlanningNotFoundError)
      return jsonError(409, 'list_changed', error.message);
    throw error;
  }
}

export async function DELETE(request: Request, context: { params: Promise<{ listId: string }> }) {
  const authorization = await authorizeApi(request, 'shoppingLists', 'delete');
  if (authorization.response) return authorization.response;
  const originError = requireTrustedSessionMutation(
    request,
    authorization.principal,
    authorization.requestId,
  );
  if (originError) return originError;
  try {
    deleteShoppingList((await context.params).listId);
    return withApiRequestId(new NextResponse(null, { status: 204 }), authorization.requestId);
  } catch (error) {
    if (error instanceof PlanningNotFoundError)
      return jsonError(409, 'list_delete_refused', error.message);
    throw error;
  }
}
