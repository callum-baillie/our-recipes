import { cookies } from 'next/headers';
import { NextResponse } from 'next/server';

import { ACTIVE_PROFILE_COOKIE, getActorContext } from '@/lib/actor-context';
import { mealPlanBatchSchema } from '@/lib/domain/planning';
import { hasTrustedMutationOrigin, jsonError } from '@/lib/http';
import { addMealPlanEntriesWithNutrition } from '@/lib/services/nutrition-planning-orchestration-service';
import { PlanningNotFoundError } from '@/lib/services/planning-service';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

export async function POST(request: Request) {
  if (!hasTrustedMutationOrigin(request)) {
    return jsonError(403, 'untrusted_origin', 'This change must come from a trusted app origin.');
  }
  const actor = getActorContext((await cookies()).get(ACTIVE_PROFILE_COOKIE)?.value);
  if (!actor.profileId) {
    return jsonError(
      409,
      'profile_selection_required',
      'Choose a household profile before planning meals.',
    );
  }
  const parsed = mealPlanBatchSchema.safeParse(await request.json().catch(() => null));
  if (!parsed.success) {
    return jsonError(400, 'invalid_planned_meals', 'Check the meal plan details and try again.');
  }
  try {
    return NextResponse.json(
      { meals: addMealPlanEntriesWithNutrition(parsed.data, actor.profileId) },
      { status: 201 },
    );
  } catch (error) {
    if (error instanceof PlanningNotFoundError) {
      return jsonError(404, 'recipe_not_found', error.message);
    }
    throw error;
  }
}
