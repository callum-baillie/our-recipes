import { cookies } from 'next/headers';
import { NextResponse } from 'next/server';

import { ACTIVE_PROFILE_COOKIE, getActorContext } from '@/lib/actor-context';
import { swapMealPlanEntriesSchema } from '@/lib/domain/planning';
import { hasTrustedMutationOrigin, jsonError } from '@/lib/http';
import { PlanningNotFoundError, swapMealPlanEntries } from '@/lib/services/planning-service';

export const runtime = 'nodejs';

export async function POST(request: Request) {
  if (!hasTrustedMutationOrigin(request))
    return jsonError(403, 'untrusted_origin', 'This change must come from a trusted app origin.');
  const actor = getActorContext((await cookies()).get(ACTIVE_PROFILE_COOKIE)?.value);
  if (!actor.profileId)
    return jsonError(409, 'profile_selection_required', 'Choose a household profile first.');
  const parsed = swapMealPlanEntriesSchema.safeParse(await request.json().catch(() => null));
  if (!parsed.success)
    return jsonError(400, 'invalid_meal_swap', 'Choose two current planned meals to swap.');
  try {
    return NextResponse.json({ meals: swapMealPlanEntries(parsed.data, actor.profileId) });
  } catch (error) {
    if (error instanceof PlanningNotFoundError)
      return jsonError(409, 'planned_meal_changed', error.message);
    throw error;
  }
}
