import { withApiRequestId, authorizeCoreApi, actorFromPrincipal } from '@/lib/api-auth';

import { NextResponse } from 'next/server';

import { pantryShortageGenerationSchema } from '@/lib/domain/pantry-grocery-cooking';
import { jsonError } from '@/lib/http';
import {
  generatePantryShortageList,
  PantryGroceryCookingConflictError,
  PantryGroceryCookingNotFoundError,
  PantryGroceryCookingPrerequisiteError,
} from '@/lib/services/pantry-grocery-cooking-service';

export const runtime = 'nodejs';

export async function POST(request: Request) {
  const access = await authorizeCoreApi(request);
  if (access.response) return access.response;

  const actor = actorFromPrincipal(access.principal);
  if (!actor.profileId)
    return withApiRequestId(
      jsonError(409, 'profile_selection_required', 'Choose a household profile first.'),
      access.requestId,
    );
  const parsed = pantryShortageGenerationSchema.safeParse(await request.json().catch(() => null));
  if (!parsed.success)
    return withApiRequestId(
      jsonError(400, 'invalid_pantry_shortage_range', 'Use a valid week range and list.'),
      access.requestId,
    );
  try {
    const result = generatePantryShortageList(parsed.data, actor.profileId);
    return withApiRequestId(
      NextResponse.json(result, { status: parsed.data.listId ? 200 : 201 }),
      access.requestId,
    );
  } catch (error) {
    if (error instanceof PantryGroceryCookingNotFoundError)
      return withApiRequestId(
        jsonError(404, 'shopping_list_not_found', error.message),
        access.requestId,
      );
    if (error instanceof PantryGroceryCookingConflictError)
      return withApiRequestId(
        jsonError(409, 'shopping_list_changed', error.message),
        access.requestId,
      );
    if (error instanceof PantryGroceryCookingPrerequisiteError)
      return withApiRequestId(jsonError(409, 'plan_required', error.message), access.requestId);
    throw error;
  }
}
