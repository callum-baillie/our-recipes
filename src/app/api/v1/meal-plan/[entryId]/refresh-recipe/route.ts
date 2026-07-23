import { cookies } from 'next/headers';
import { NextResponse } from 'next/server';

import { ACTIVE_PROFILE_COOKIE, getActorContext } from '@/lib/actor-context';
import { hasTrustedMutationOrigin, jsonError } from '@/lib/http';
import {
  PlanningNotFoundError,
  refreshMealPlanRecipeSnapshot,
} from '@/lib/services/planning-service';

export const runtime = 'nodejs';

export async function POST(request: Request, context: { params: Promise<{ entryId: string }> }) {
  if (!hasTrustedMutationOrigin(request)) {
    return jsonError(403, 'untrusted_origin', 'This change must come from a trusted app origin.');
  }
  const actor = getActorContext((await cookies()).get(ACTIVE_PROFILE_COOKIE)?.value);
  if (!actor.profileId) {
    return jsonError(409, 'profile_selection_required', 'Choose a household profile first.');
  }
  try {
    return NextResponse.json({
      meal: refreshMealPlanRecipeSnapshot((await context.params).entryId, actor.profileId),
    });
  } catch (error) {
    if (error instanceof PlanningNotFoundError) {
      return jsonError(404, 'planned_meal_not_found', error.message);
    }
    throw error;
  }
}
