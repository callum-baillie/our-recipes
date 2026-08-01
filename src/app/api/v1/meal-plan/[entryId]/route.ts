import { NextResponse } from 'next/server';

import { authorizeApi, requireTrustedSessionMutation, withApiRequestId } from '@/lib/api-auth';
import { mealPlanEntryUpdateSchema, mealPlanStatusUpdateSchema } from '@/lib/domain/planning';
import { jsonError } from '@/lib/http';
import { getPlannedMeal, PlanningNotFoundError } from '@/lib/services/planning-service';
import {
  removeMealPlanEntryWithNutrition,
  updateMealPlanEntryWithNutrition,
  updateMealPlanEntryStatusWithNutrition,
} from '@/lib/services/nutrition-planning-orchestration-service';

export const runtime = 'nodejs';

export async function GET(request: Request, context: { params: Promise<{ entryId: string }> }) {
  const authorization = await authorizeApi(request, 'mealPlans', 'read');
  if (authorization.response) return authorization.response;
  const meal = getPlannedMeal((await context.params).entryId);
  return meal
    ? withApiRequestId(NextResponse.json({ meal }), authorization.requestId)
    : jsonError(404, 'planned_meal_not_found', 'That planned meal no longer exists.');
}

export async function PATCH(request: Request, context: { params: Promise<{ entryId: string }> }) {
  const authorization = await authorizeApi(request, 'mealPlans', 'update');
  if (authorization.response) return authorization.response;
  const originError = requireTrustedSessionMutation(
    request,
    authorization.principal,
    authorization.requestId,
  );
  if (originError) return originError;
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
    return withApiRequestId(
      NextResponse.json({
        meal: statusUpdate.success
          ? updateMealPlanEntryStatusWithNutrition(
              (await context.params).entryId,
              statusUpdate.data.status,
              authorization.principal.profileId,
            )
          : updateMealPlanEntryWithNutrition(
              (await context.params).entryId,
              entryUpdate.data!,
              authorization.principal.profileId,
            ),
      }),
      authorization.requestId,
    );
  } catch (error) {
    if (error instanceof PlanningNotFoundError)
      return jsonError(404, 'planned_meal_not_found', error.message);
    throw error;
  }
}

export async function DELETE(request: Request, context: { params: Promise<{ entryId: string }> }) {
  const authorization = await authorizeApi(request, 'mealPlans', 'delete');
  if (authorization.response) return authorization.response;
  const originError = requireTrustedSessionMutation(
    request,
    authorization.principal,
    authorization.requestId,
  );
  if (originError) return originError;
  try {
    removeMealPlanEntryWithNutrition(
      (await context.params).entryId,
      authorization.principal.profileId,
    );
    return withApiRequestId(new NextResponse(null, { status: 204 }), authorization.requestId);
  } catch (error) {
    if (error instanceof PlanningNotFoundError)
      return jsonError(404, 'planned_meal_not_found', error.message);
    throw error;
  }
}
