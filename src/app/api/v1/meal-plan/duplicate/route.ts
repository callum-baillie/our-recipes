import { cookies } from 'next/headers';
import { NextResponse } from 'next/server';

import { ACTIVE_PROFILE_COOKIE, getActorContext } from '@/lib/actor-context';
import { duplicateWeekSchema } from '@/lib/domain/planning';
import { hasTrustedMutationOrigin, jsonError } from '@/lib/http';
import { duplicateWeekWithNutrition } from '@/lib/services/nutrition-planning-orchestration-service';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

export async function POST(request: Request) {
  if (!hasTrustedMutationOrigin(request))
    return jsonError(403, 'untrusted_origin', 'This change must come from a trusted app origin.');
  const actor = getActorContext((await cookies()).get(ACTIVE_PROFILE_COOKIE)?.value);
  if (!actor.profileId)
    return jsonError(
      409,
      'profile_selection_required',
      'Choose a household profile before copying a week.',
    );
  const parsed = duplicateWeekSchema.safeParse(await request.json().catch(() => null));
  if (!parsed.success)
    return jsonError(400, 'invalid_week_copy', 'Use valid source and destination weeks.');
  return NextResponse.json(
    { meals: duplicateWeekWithNutrition(parsed.data, actor.profileId) },
    { status: 201 },
  );
}
