import { cookies } from 'next/headers';
import { NextResponse } from 'next/server';

import { ACTIVE_PROFILE_COOKIE, getActorContext } from '@/lib/actor-context';
import { shoppingListRetryStoreSchema } from '@/lib/domain/planning';
import { hasTrustedMutationOrigin, jsonError } from '@/lib/http';
import {
  createRetryShoppingList,
  PlanningNotFoundError,
} from '@/lib/services/planning-service';

export const runtime = 'nodejs';

export async function POST(
  request: Request,
  context: { params: Promise<{ listId: string }> },
) {
  if (!hasTrustedMutationOrigin(request))
    return jsonError(403, 'untrusted_origin', 'This change must come from a trusted app origin.');
  const actor = getActorContext((await cookies()).get(ACTIVE_PROFILE_COOKIE)?.value);
  if (!actor.profileId)
    return jsonError(409, 'profile_selection_required', 'Choose a household profile first.');
  const parsed = shoppingListRetryStoreSchema.safeParse(await request.json().catch(() => null));
  if (!parsed.success)
    return jsonError(400, 'invalid_supermarket_selection', 'Choose a valid supermarket.');
  try {
    return NextResponse.json(
      {
        list: createRetryShoppingList(
          (await context.params).listId,
          parsed.data.supermarketProfileId,
          actor.profileId,
        ),
      },
      { status: 201 },
    );
  } catch (error) {
    if (error instanceof PlanningNotFoundError)
      return jsonError(409, 'retry_list_unavailable', error.message);
    throw error;
  }
}
