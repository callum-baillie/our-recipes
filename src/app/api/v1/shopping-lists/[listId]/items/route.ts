import { cookies } from 'next/headers';
import { NextResponse } from 'next/server';

import { ACTIVE_PROFILE_COOKIE, getActorContext } from '@/lib/actor-context';
import { shoppingListItemSchema } from '@/lib/domain/planning';
import { hasTrustedMutationOrigin, jsonError } from '@/lib/http';
import { addShoppingListItem, PlanningNotFoundError } from '@/lib/services/planning-service';

export const runtime = 'nodejs';

export async function POST(request: Request, context: { params: Promise<{ listId: string }> }) {
  if (!hasTrustedMutationOrigin(request))
    return jsonError(403, 'untrusted_origin', 'This change must come from a trusted app origin.');
  const actor = getActorContext((await cookies()).get(ACTIVE_PROFILE_COOKIE)?.value);
  if (!actor.profileId)
    return jsonError(409, 'profile_selection_required', 'Choose a household profile first.');
  const parsed = shoppingListItemSchema.safeParse(await request.json().catch(() => null));
  if (!parsed.success)
    return jsonError(400, 'invalid_list_item', 'Check the shopping item details.');
  try {
    return NextResponse.json(
      { item: addShoppingListItem((await context.params).listId, parsed.data, actor.profileId) },
      { status: 201 },
    );
  } catch (error) {
    if (error instanceof PlanningNotFoundError)
      return jsonError(404, 'shopping_list_not_found', error.message);
    throw error;
  }
}
