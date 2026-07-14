import { NextResponse } from 'next/server';

import { shoppingListReorderSchema } from '@/lib/domain/planning';
import { hasTrustedMutationOrigin, jsonError } from '@/lib/http';
import {
  getShoppingList,
  PlanningNotFoundError,
  reorderShoppingListItems,
} from '@/lib/services/planning-service';

export const runtime = 'nodejs';

export async function GET(_request: Request, context: { params: Promise<{ listId: string }> }) {
  const list = getShoppingList((await context.params).listId);
  return list
    ? NextResponse.json({ list })
    : jsonError(404, 'shopping_list_not_found', 'That shopping list no longer exists.');
}

export async function PATCH(request: Request, context: { params: Promise<{ listId: string }> }) {
  if (!hasTrustedMutationOrigin(request))
    return jsonError(403, 'untrusted_origin', 'This change must come from a trusted app origin.');
  const parsed = shoppingListReorderSchema.safeParse(await request.json().catch(() => null));
  if (!parsed.success) return jsonError(400, 'invalid_order', 'Use the current set of list items.');
  try {
    reorderShoppingListItems((await context.params).listId, parsed.data.itemIds);
    return NextResponse.json({ ok: true });
  } catch (error) {
    if (error instanceof PlanningNotFoundError)
      return jsonError(409, 'list_changed', error.message);
    throw error;
  }
}
