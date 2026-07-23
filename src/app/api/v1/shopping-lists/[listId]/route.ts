import { NextResponse } from 'next/server';
import { cookies } from 'next/headers';

import { ACTIVE_PROFILE_COOKIE, getActorContext } from '@/lib/actor-context';
import { shoppingListManageSchema, shoppingListReorderSchema } from '@/lib/domain/planning';
import { hasTrustedMutationOrigin, jsonError } from '@/lib/http';
import {
  getShoppingList,
  deleteShoppingList,
  manageShoppingList,
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
  const actor = getActorContext((await cookies()).get(ACTIVE_PROFILE_COOKIE)?.value);
  if (!actor.profileId)
    return jsonError(409, 'profile_selection_required', 'Choose a household profile first.');
  const raw = await request.json().catch(() => null);
  const managed = shoppingListManageSchema.safeParse(raw);
  if (managed.success) {
    try {
      return NextResponse.json({
        list: manageShoppingList((await context.params).listId, managed.data, actor.profileId),
      });
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
    return NextResponse.json({ ok: true });
  } catch (error) {
    if (error instanceof PlanningNotFoundError)
      return jsonError(409, 'list_changed', error.message);
    throw error;
  }
}

export async function DELETE(request: Request, context: { params: Promise<{ listId: string }> }) {
  if (!hasTrustedMutationOrigin(request))
    return jsonError(403, 'untrusted_origin', 'This change must come from a trusted app origin.');
  const actor = getActorContext((await cookies()).get(ACTIVE_PROFILE_COOKIE)?.value);
  if (!actor.profileId)
    return jsonError(409, 'profile_selection_required', 'Choose a household profile first.');
  try {
    deleteShoppingList((await context.params).listId);
    return new NextResponse(null, { status: 204 });
  } catch (error) {
    if (error instanceof PlanningNotFoundError)
      return jsonError(409, 'list_delete_refused', error.message);
    throw error;
  }
}
