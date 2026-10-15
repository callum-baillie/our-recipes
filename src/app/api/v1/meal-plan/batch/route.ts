import { withApiRequestId, authorizeCoreApi, actorFromPrincipal } from '@/lib/api-auth';

import { NextResponse } from 'next/server';

import { mealPlanBatchSchema } from '@/lib/domain/planning';
import { jsonError } from '@/lib/http';
import { addMealPlanEntriesWithNutrition } from '@/lib/services/nutrition-planning-orchestration-service';
import { PlanningNotFoundError } from '@/lib/services/planning-service';
import { reconcileAutomaticRestockPolicies } from '@/lib/services/pantry-grocery-cooking-service';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

export async function POST(request: Request) {
  const access = await authorizeCoreApi(request);
  if (access.response) return access.response;

  const actor = actorFromPrincipal(access.principal);
  if (!actor.profileId) {
    return withApiRequestId(
      jsonError(
        409,
        'profile_selection_required',
        'Choose a household profile before planning meals.',
      ),
      access.requestId,
    );
  }
  const parsed = mealPlanBatchSchema.safeParse(await request.json().catch(() => null));
  if (!parsed.success) {
    return withApiRequestId(
      jsonError(400, 'invalid_planned_meals', 'Check the meal plan details and try again.'),
      access.requestId,
    );
  }
  try {
    const meals = addMealPlanEntriesWithNutrition(parsed.data, actor.profileId);
    reconcileAutomaticRestockPolicies(actor.profileId);
    return withApiRequestId(NextResponse.json({ meals }, { status: 201 }), access.requestId);
  } catch (error) {
    if (error instanceof PlanningNotFoundError) {
      return withApiRequestId(jsonError(404, 'recipe_not_found', error.message), access.requestId);
    }
    throw error;
  }
}
