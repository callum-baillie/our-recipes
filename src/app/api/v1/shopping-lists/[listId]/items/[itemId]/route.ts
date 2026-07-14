import { NextResponse } from 'next/server';

import { shoppingListItemSchema } from '@/lib/domain/planning';
import { hasTrustedMutationOrigin, jsonError } from '@/lib/http';
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
  if (!hasTrustedMutationOrigin(request))
    return jsonError(403, 'untrusted_origin', 'This change must come from a trusted app origin.');
  const parsed = shoppingListItemSchema.safeParse(await request.json().catch(() => null));
  if (!parsed.success)
    return jsonError(400, 'invalid_list_item', 'Check the shopping item details.');
  try {
    const { listId, itemId } = await context.params;
    updateShoppingListItem(listId, itemId, parsed.data);
    return NextResponse.json({ ok: true });
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
  if (!hasTrustedMutationOrigin(request))
    return jsonError(403, 'untrusted_origin', 'This change must come from a trusted app origin.');
  try {
    const { listId, itemId } = await context.params;
    removeShoppingListItem(listId, itemId);
    return new NextResponse(null, { status: 204 });
  } catch (error) {
    if (error instanceof PlanningNotFoundError)
      return jsonError(404, 'shopping_item_not_found', error.message);
    throw error;
  }
}
