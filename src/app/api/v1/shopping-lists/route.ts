import { NextResponse } from 'next/server';

import { authorizeApi, requireTrustedSessionMutation, withApiRequestId } from '@/lib/api-auth';
import { idempotentJsonResponse, prepareIdempotentMutation } from '@/lib/api-idempotency';
import {
  shoppingListCreateSchema,
  shoppingListGenerateSchema,
  shoppingListRequestSchema,
} from '@/lib/domain/planning';
import { jsonError } from '@/lib/http';
import {
  generatePantryShortageList,
  PantryGroceryCookingPrerequisiteError,
} from '@/lib/services/pantry-grocery-cooking-service';
import {
  createManualShoppingList,
  getShoppingList,
  listShoppingLists,
  PlanningNotFoundError,
} from '@/lib/services/planning-service';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

export async function GET(request: Request) {
  const authorization = await authorizeApi(request, 'shoppingLists', 'read');
  if (authorization.response) return authorization.response;
  const includeArchived = new URL(request.url).searchParams.get('includeArchived') === 'true';
  return withApiRequestId(
    NextResponse.json({ lists: listShoppingLists(includeArchived) }),
    authorization.requestId,
  );
}

export async function POST(request: Request) {
  const authorization = await authorizeApi(request, 'shoppingLists', 'create');
  if (authorization.response) return authorization.response;
  const originError = requireTrustedSessionMutation(
    request,
    authorization.principal,
    authorization.requestId,
  );
  if (originError) return originError;
  const idempotency = await prepareIdempotentMutation(
    request,
    authorization.principal,
    authorization.requestId,
  );
  if (idempotency.response) return idempotency.response;
  const raw = idempotency.context.body;
  const tagged = shoppingListRequestSchema.safeParse(raw);
  if (tagged.success && tagged.data.kind === 'manual') {
    return idempotentJsonResponse(
      idempotency.context,
      {
        list: createManualShoppingList(tagged.data.name, authorization.principal.profileId),
      },
      authorization.requestId,
      201,
    );
  }
  const manual = shoppingListCreateSchema.safeParse(raw);
  if (manual.success) {
    return idempotentJsonResponse(
      idempotency.context,
      {
        list: createManualShoppingList(manual.data.name, authorization.principal.profileId),
      },
      authorization.requestId,
      201,
    );
  }
  const legacy = shoppingListGenerateSchema.safeParse(raw);
  const planner =
    tagged.success && tagged.data.kind === 'planner'
      ? tagged.data
      : legacy.success
        ? { ...legacy.data, sourceMode: 'pantry_all' as const }
        : null;
  if (!planner) return jsonError(400, 'invalid_list', 'Use a list name or valid week range.');
  try {
    const generated = generatePantryShortageList(
      {
        weekStart: planner.weekStart,
        weekEnd: planner.weekEnd,
        mode: planner.sourceMode === 'pantry_missing' ? 'missing' : 'all',
      },
      authorization.principal.profileId,
    );
    return idempotentJsonResponse(
      idempotency.context,
      { list: getShoppingList(generated.listId), restored: generated.restored },
      authorization.requestId,
      201,
    );
  } catch (error) {
    if (
      error instanceof PlanningNotFoundError ||
      error instanceof PantryGroceryCookingPrerequisiteError
    )
      return jsonError(409, 'plan_required', error.message);
    throw error;
  }
}
