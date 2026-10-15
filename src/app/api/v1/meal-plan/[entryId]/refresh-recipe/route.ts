import { withApiRequestId, authorizeCoreApi, actorFromPrincipal } from '@/lib/api-auth';

import { NextResponse } from 'next/server';

import { jsonError } from '@/lib/http';
import {
  PlanningNotFoundError,
  refreshMealPlanRecipeSnapshot,
} from '@/lib/services/planning-service';

export const runtime = 'nodejs';

export async function POST(request: Request, context: { params: Promise<{ entryId: string }> }) {
  const access = await authorizeCoreApi(request);
  if (access.response) return access.response;

  const actor = actorFromPrincipal(access.principal);
  if (!actor.profileId) {
    return withApiRequestId(
      jsonError(409, 'profile_selection_required', 'Choose a household profile first.'),
      access.requestId,
    );
  }
  try {
    return withApiRequestId(
      NextResponse.json({
        meal: refreshMealPlanRecipeSnapshot((await context.params).entryId, actor.profileId),
      }),
      access.requestId,
    );
  } catch (error) {
    if (error instanceof PlanningNotFoundError) {
      return withApiRequestId(
        jsonError(404, 'planned_meal_not_found', error.message),
        access.requestId,
      );
    }
    throw error;
  }
}
