import { withApiRequestId, authorizeCoreApi, actorFromPrincipal } from '@/lib/api-auth';

import { NextResponse } from 'next/server';

import { shoppingListSupermarketSchema } from '@/lib/domain/list-settings';
import { jsonError } from '@/lib/http';
import {
  ListSettingsConflictError,
  ListSettingsNotFoundError,
  setShoppingListSupermarket,
} from '@/lib/services/list-settings-service';

export const runtime = 'nodejs';

export async function PATCH(request: Request, context: { params: Promise<{ listId: string }> }) {
  const access = await authorizeCoreApi(request);
  if (access.response) return access.response;

  const actor = actorFromPrincipal(access.principal);
  if (!actor.profileId)
    return withApiRequestId(
      jsonError(409, 'profile_selection_required', 'Choose a household profile first.'),
      access.requestId,
    );
  const parsed = shoppingListSupermarketSchema.safeParse(await request.json().catch(() => null));
  if (!parsed.success)
    return withApiRequestId(
      jsonError(400, 'invalid_supermarket_selection', 'Choose a valid supermarket.'),
      access.requestId,
    );
  try {
    setShoppingListSupermarket(
      (await context.params).listId,
      parsed.data.supermarketProfileId || null,
      actor.profileId,
    );
    return withApiRequestId(NextResponse.json({ ok: true }), access.requestId);
  } catch (error) {
    if (error instanceof ListSettingsNotFoundError)
      return withApiRequestId(
        jsonError(404, 'shopping_list_not_found', error.message),
        access.requestId,
      );
    if (error instanceof ListSettingsConflictError)
      return withApiRequestId(
        jsonError(409, 'supermarket_conflict', error.message),
        access.requestId,
      );
    throw error;
  }
}
