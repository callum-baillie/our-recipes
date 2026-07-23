import { cookies } from 'next/headers';

import { ACTIVE_PROFILE_COOKIE, getActorContext } from '@/lib/actor-context';
import { pantryShoppingControlSchema } from '@/lib/domain/pantry-grocery-cooking';
import { hasTrustedMutationOrigin, jsonError } from '@/lib/http';
import {
  PantryGroceryCookingNotFoundError,
  updateShoppingItemPantryControl,
} from '@/lib/services/pantry-grocery-cooking-service';

export const runtime = 'nodejs';

export async function PATCH(
  request: Request,
  context: { params: Promise<{ listId: string; itemId: string }> },
) {
  if (!hasTrustedMutationOrigin(request))
    return jsonError(403, 'untrusted_origin', 'This change must come from a trusted app origin.');
  const actor = getActorContext((await cookies()).get(ACTIVE_PROFILE_COOKIE)?.value);
  if (!actor.profileId)
    return jsonError(409, 'profile_selection_required', 'Choose a household profile first.');
  const parsed = pantryShoppingControlSchema.safeParse(await request.json().catch(() => null));
  if (!parsed.success)
    return jsonError(400, 'invalid_pantry_control', 'Check the Pantry grocery control.');
  const { listId, itemId } = await context.params;
  try {
    return Response.json({
      detail: updateShoppingItemPantryControl(listId, itemId, parsed.data, actor.profileId),
    });
  } catch (error) {
    if (error instanceof PantryGroceryCookingNotFoundError)
      return jsonError(404, 'pantry_control_not_found', error.message);
    throw error;
  }
}
