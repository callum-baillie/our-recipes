import { cookies } from 'next/headers';
import { NextResponse } from 'next/server';

import { ACTIVE_PROFILE_COOKIE, getActorContext } from '@/lib/actor-context';
import { isoDateSchema, mealPlanEntrySchema } from '@/lib/domain/planning';
import { hasTrustedMutationOrigin, jsonError } from '@/lib/http';
import {
  addMealPlanEntry,
  listPlannedMeals,
  PlanningNotFoundError,
} from '@/lib/services/planning-service';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

export function GET(request: Request) {
  const params = new URL(request.url).searchParams;
  const start = isoDateSchema.safeParse(params.get('start'));
  const end = isoDateSchema.safeParse(params.get('end'));
  if (!start.success || !end.success)
    return jsonError(400, 'invalid_week', 'Use a valid week range.');
  return NextResponse.json({ meals: listPlannedMeals(start.data, end.data) });
}

export async function POST(request: Request) {
  if (!hasTrustedMutationOrigin(request))
    return jsonError(403, 'untrusted_origin', 'This change must come from a trusted app origin.');
  const actor = getActorContext((await cookies()).get(ACTIVE_PROFILE_COOKIE)?.value);
  if (!actor.profileId)
    return jsonError(
      409,
      'profile_selection_required',
      'Choose a household profile before planning a meal.',
    );
  const parsed = mealPlanEntrySchema.safeParse(await request.json().catch(() => null));
  if (!parsed.success)
    return jsonError(400, 'invalid_planned_meal', 'Check the planned meal details.');
  try {
    return NextResponse.json(
      { meal: addMealPlanEntry(parsed.data, actor.profileId) },
      { status: 201 },
    );
  } catch (error) {
    if (error instanceof PlanningNotFoundError)
      return jsonError(404, 'recipe_not_found', error.message);
    throw error;
  }
}
