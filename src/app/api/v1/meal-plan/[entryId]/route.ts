import { cookies } from 'next/headers';
import { NextResponse } from 'next/server';

import { ACTIVE_PROFILE_COOKIE, getActorContext } from '@/lib/actor-context';
import { mealPlanEntryUpdateSchema, mealPlanStatusUpdateSchema } from '@/lib/domain/planning';
import { hasTrustedMutationOrigin, jsonError } from '@/lib/http';
import { PlanningNotFoundError } from '@/lib/services/planning-service';
import {
  removeMealPlanEntryWithNutrition,
  updateMealPlanEntryWithNutrition,
  updateMealPlanEntryStatusWithNutrition,
} from '@/lib/services/nutrition-planning-orchestration-service';

export const runtime = 'nodejs';

export async function PATCH(request: Request, context: { params: Promise<{ entryId: string }> }) {
  if (!hasTrustedMutationOrigin(request))
    return jsonError(403, 'untrusted_origin', 'This change must come from a trusted app origin.');
  const actor = getActorContext((await cookies()).get(ACTIVE_PROFILE_COOKIE)?.value);
  if (!actor.profileId)
    return jsonError(409, 'profile_selection_required', 'Choose a household profile first.');
  const body = await request.json().catch(() => null);
  const statusUpdate = mealPlanStatusUpdateSchema.safeParse(body);
  const entryUpdate = mealPlanEntryUpdateSchema.safeParse(body);
  if (!statusUpdate.success && !entryUpdate.success)
    return jsonError(
      400,
      'invalid_meal_update',
      'Check the planned date, meal, recipe, servings, and note.',
    );
  try {
    return NextResponse.json({
      meal: statusUpdate.success
        ? updateMealPlanEntryStatusWithNutrition(
            (await context.params).entryId,
            statusUpdate.data.status,
            actor.profileId,
          )
        : updateMealPlanEntryWithNutrition(
            (await context.params).entryId,
            entryUpdate.data!,
            actor.profileId,
          ),
    });
  } catch (error) {
    if (error instanceof PlanningNotFoundError)
      return jsonError(404, 'planned_meal_not_found', error.message);
    throw error;
  }
}

export async function DELETE(request: Request, context: { params: Promise<{ entryId: string }> }) {
  if (!hasTrustedMutationOrigin(request))
    return jsonError(403, 'untrusted_origin', 'This change must come from a trusted app origin.');
  const actor = getActorContext((await cookies()).get(ACTIVE_PROFILE_COOKIE)?.value);
  if (!actor.profileId)
    return jsonError(409, 'profile_selection_required', 'Choose a household profile first.');
  try {
    removeMealPlanEntryWithNutrition((await context.params).entryId, actor.profileId);
    return new NextResponse(null, { status: 204 });
  } catch (error) {
    if (error instanceof PlanningNotFoundError)
      return jsonError(404, 'planned_meal_not_found', error.message);
    throw error;
  }
}
