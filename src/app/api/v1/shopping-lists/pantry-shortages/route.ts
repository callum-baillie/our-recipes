import { cookies } from 'next/headers';
import { NextResponse } from 'next/server';

import { ACTIVE_PROFILE_COOKIE, getActorContext } from '@/lib/actor-context';
import { pantryShortageGenerationSchema } from '@/lib/domain/pantry-grocery-cooking';
import { hasTrustedMutationOrigin, jsonError } from '@/lib/http';
import {
  generatePantryShortageList,
  PantryGroceryCookingConflictError,
  PantryGroceryCookingNotFoundError,
} from '@/lib/services/pantry-grocery-cooking-service';

export const runtime = 'nodejs';

export async function POST(request: Request) {
  if (!hasTrustedMutationOrigin(request))
    return jsonError(403, 'untrusted_origin', 'This change must come from a trusted app origin.');
  const actor = getActorContext((await cookies()).get(ACTIVE_PROFILE_COOKIE)?.value);
  if (!actor.profileId)
    return jsonError(409, 'profile_selection_required', 'Choose a household profile first.');
  const parsed = pantryShortageGenerationSchema.safeParse(await request.json().catch(() => null));
  if (!parsed.success)
    return jsonError(400, 'invalid_pantry_shortage_range', 'Use a valid week range and list.');
  try {
    const result = generatePantryShortageList(parsed.data, actor.profileId);
    return NextResponse.json(result, { status: parsed.data.listId ? 200 : 201 });
  } catch (error) {
    if (error instanceof PantryGroceryCookingNotFoundError)
      return jsonError(404, 'shopping_list_not_found', error.message);
    if (error instanceof PantryGroceryCookingConflictError)
      return jsonError(409, 'shopping_list_changed', error.message);
    throw error;
  }
}
