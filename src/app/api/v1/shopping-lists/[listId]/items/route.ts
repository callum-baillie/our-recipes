import { NextResponse } from 'next/server';

import { authorizeApi, requireTrustedSessionMutation, withApiRequestId } from '@/lib/api-auth';
import { shoppingListItemSchema } from '@/lib/domain/planning';
import { jsonError } from '@/lib/http';
import { addShoppingListItem, PlanningNotFoundError } from '@/lib/services/planning-service';

export const runtime = 'nodejs';

export async function POST(request: Request, context: { params: Promise<{ listId: string }> }) {
  const authorization = await authorizeApi(request, 'shoppingLists', 'create');
  if (authorization.response) return authorization.response;
  const originError = requireTrustedSessionMutation(
    request,
    authorization.principal,
    authorization.requestId,
  );
  if (originError) return originError;
  const parsed = shoppingListItemSchema.safeParse(await request.json().catch(() => null));
  if (!parsed.success)
    return jsonError(400, 'invalid_list_item', 'Check the shopping item details.');
  try {
    return withApiRequestId(
      NextResponse.json(
        {
          item: addShoppingListItem(
            (await context.params).listId,
            parsed.data,
            authorization.principal.profileId,
          ),
        },
        { status: 201 },
      ),
      authorization.requestId,
    );
  } catch (error) {
    if (error instanceof PlanningNotFoundError)
      return jsonError(404, 'shopping_list_not_found', error.message);
    throw error;
  }
}
