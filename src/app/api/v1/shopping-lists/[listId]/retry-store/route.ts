import { withApiRequestId, authorizeCoreApi, actorFromPrincipal } from '@/lib/api-auth';

import { NextResponse } from 'next/server';

import { shoppingListRetryStoreSchema } from '@/lib/domain/planning';
import { jsonError } from '@/lib/http';
import { createRetryShoppingList, PlanningNotFoundError } from '@/lib/services/planning-service';

export const runtime = 'nodejs';

export async function POST(request: Request, context: { params: Promise<{ listId: string }> }) {
  const access = await authorizeCoreApi(request);
  if (access.response) return access.response;

  const actor = actorFromPrincipal(access.principal);
  if (!actor.profileId)
    return withApiRequestId(
      jsonError(409, 'profile_selection_required', 'Choose a household profile first.'),
      access.requestId,
    );
  const parsed = shoppingListRetryStoreSchema.safeParse(await request.json().catch(() => null));
  if (!parsed.success)
    return withApiRequestId(
      jsonError(400, 'invalid_supermarket_selection', 'Choose a valid supermarket.'),
      access.requestId,
    );
  try {
    return withApiRequestId(
      NextResponse.json(
        {
          list: createRetryShoppingList(
            (await context.params).listId,
            parsed.data.supermarketProfileId,
            actor.profileId,
          ),
        },
        { status: 201 },
      ),
      access.requestId,
    );
  } catch (error) {
    if (error instanceof PlanningNotFoundError)
      return withApiRequestId(
        jsonError(409, 'retry_list_unavailable', error.message),
        access.requestId,
      );
    throw error;
  }
}
