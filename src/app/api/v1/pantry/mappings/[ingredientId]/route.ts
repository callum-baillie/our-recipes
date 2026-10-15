import { withApiRequestId, authorizeCoreApi, actorFromPrincipal } from '@/lib/api-auth';
import { NextResponse } from 'next/server';

import { pantryMappingInputSchema } from '@/lib/domain/pantry-availability';
import { jsonError } from '@/lib/http';
import {
  PantryAvailabilityNotFoundError,
  removeRecipeIngredientPantryMapping,
  setRecipeIngredientPantryMapping,
} from '@/lib/services/pantry-availability-service';
import { reconcileAutomaticRestockPolicies } from '@/lib/services/pantry-grocery-cooking-service';

export const runtime = 'nodejs';

export async function PUT(
  request: Request,
  context: { params: Promise<{ ingredientId: string }> },
) {
  const access = await authorizeCoreApi(request);
  if (access.response) return access.response;

  const actor = actorFromPrincipal(access.principal);

  const parsed = pantryMappingInputSchema.safeParse(await request.json().catch(() => null));
  if (!parsed.success)
    return withApiRequestId(
      jsonError(400, 'invalid_pantry_mapping', 'Choose a valid Pantry product mapping.'),
      access.requestId,
    );
  try {
    const mapping = setRecipeIngredientPantryMapping(
      (await context.params).ingredientId,
      parsed.data,
      actor.profileId,
    );
    reconcileAutomaticRestockPolicies(actor.profileId);
    return withApiRequestId(
      NextResponse.json({
        mapping,
      }),
      access.requestId,
    );
  } catch (error) {
    if (error instanceof PantryAvailabilityNotFoundError)
      return withApiRequestId(
        jsonError(404, 'pantry_mapping_not_found', error.message),
        access.requestId,
      );
    throw error;
  }
}

export async function DELETE(
  request: Request,
  context: { params: Promise<{ ingredientId: string }> },
) {
  const access = await authorizeCoreApi(request);
  if (access.response) return access.response;

  const actor = actorFromPrincipal(access.principal);

  try {
    removeRecipeIngredientPantryMapping((await context.params).ingredientId);
    reconcileAutomaticRestockPolicies(actor.profileId);
    return withApiRequestId(new NextResponse(null, { status: 204 }), access.requestId);
  } catch (error) {
    if (error instanceof PantryAvailabilityNotFoundError)
      return withApiRequestId(
        jsonError(404, 'pantry_mapping_not_found', error.message),
        access.requestId,
      );
    throw error;
  }
}
