import { NextResponse } from 'next/server';

import { pantryMappingInputSchema } from '@/lib/domain/pantry-availability';
import { jsonError } from '@/lib/http';
import {
  PantryAvailabilityNotFoundError,
  removeRecipeIngredientPantryMapping,
  setRecipeIngredientPantryMapping,
} from '@/lib/services/pantry-availability-service';
import { reconcileAutomaticRestockPolicies } from '@/lib/services/pantry-grocery-cooking-service';

import { rejectUntrustedPantryMutation, requirePantryActor } from '../../_shared';

export const runtime = 'nodejs';

export async function PUT(
  request: Request,
  context: { params: Promise<{ ingredientId: string }> },
) {
  const rejected = rejectUntrustedPantryMutation(request);
  if (rejected) return rejected;
  const actor = await requirePantryActor();
  if (actor.response) return actor.response;
  const parsed = pantryMappingInputSchema.safeParse(await request.json().catch(() => null));
  if (!parsed.success)
    return jsonError(400, 'invalid_pantry_mapping', 'Choose a valid Pantry product mapping.');
  try {
    const mapping = setRecipeIngredientPantryMapping(
      (await context.params).ingredientId,
      parsed.data,
      actor.profileId,
    );
    reconcileAutomaticRestockPolicies(actor.profileId);
    return NextResponse.json({
      mapping,
    });
  } catch (error) {
    if (error instanceof PantryAvailabilityNotFoundError)
      return jsonError(404, 'pantry_mapping_not_found', error.message);
    throw error;
  }
}

export async function DELETE(
  request: Request,
  context: { params: Promise<{ ingredientId: string }> },
) {
  const rejected = rejectUntrustedPantryMutation(request);
  if (rejected) return rejected;
  const actor = await requirePantryActor();
  if (actor.response) return actor.response;
  try {
    removeRecipeIngredientPantryMapping((await context.params).ingredientId);
    reconcileAutomaticRestockPolicies(actor.profileId);
    return new NextResponse(null, { status: 204 });
  } catch (error) {
    if (error instanceof PantryAvailabilityNotFoundError)
      return jsonError(404, 'pantry_mapping_not_found', error.message);
    throw error;
  }
}
