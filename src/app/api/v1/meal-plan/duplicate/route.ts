import { withApiRequestId, authorizeCoreApi, actorFromPrincipal } from '@/lib/api-auth';

import { NextResponse } from 'next/server';

import { duplicateWeekSchema } from '@/lib/domain/planning';
import { jsonError } from '@/lib/http';
import { duplicateWeekWithNutrition } from '@/lib/services/nutrition-planning-orchestration-service';
import { reconcileAutomaticRestockPolicies } from '@/lib/services/pantry-grocery-cooking-service';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

export async function POST(request: Request) {
  const access = await authorizeCoreApi(request);
  if (access.response) return access.response;

  const actor = actorFromPrincipal(access.principal);
  if (!actor.profileId)
    return withApiRequestId(
      jsonError(
        409,
        'profile_selection_required',
        'Choose a household profile before copying a week.',
      ),
      access.requestId,
    );
  const parsed = duplicateWeekSchema.safeParse(await request.json().catch(() => null));
  if (!parsed.success)
    return withApiRequestId(
      jsonError(400, 'invalid_week_copy', 'Use valid source and destination weeks.'),
      access.requestId,
    );
  const meals = duplicateWeekWithNutrition(parsed.data, actor.profileId);
  reconcileAutomaticRestockPolicies(actor.profileId);
  return withApiRequestId(NextResponse.json({ meals }, { status: 201 }), access.requestId);
}
