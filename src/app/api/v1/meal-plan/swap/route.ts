import { withApiRequestId, authorizeCoreApi, actorFromPrincipal } from '@/lib/api-auth';

import { NextResponse } from 'next/server';

import { swapMealPlanEntriesSchema } from '@/lib/domain/planning';
import { jsonError } from '@/lib/http';
import { PlanningNotFoundError, swapMealPlanEntries } from '@/lib/services/planning-service';
import { reconcileAutomaticRestockPolicies } from '@/lib/services/pantry-grocery-cooking-service';

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
  const parsed = swapMealPlanEntriesSchema.safeParse(await request.json().catch(() => null));
  if (!parsed.success)
    return withApiRequestId(
      jsonError(400, 'invalid_meal_swap', 'Choose two current planned meals to swap.'),
      access.requestId,
    );
  try {
    const meals = swapMealPlanEntries(parsed.data, actor.profileId);
    reconcileAutomaticRestockPolicies(actor.profileId);
    return withApiRequestId(NextResponse.json({ meals }), access.requestId);
  } catch (error) {
    if (error instanceof PlanningNotFoundError)
      return withApiRequestId(
        jsonError(409, 'planned_meal_changed', error.message),
        access.requestId,
      );
    throw error;
  }
}
