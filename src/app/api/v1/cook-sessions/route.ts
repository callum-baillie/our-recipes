import { cookies } from 'next/headers';
import { NextResponse } from 'next/server';

import { ACTIVE_PROFILE_COOKIE, getActorContext } from '@/lib/actor-context';
import { cookSessionStartSchema } from '@/lib/domain/cooking';
import { hasTrustedMutationOrigin, jsonError } from '@/lib/http';
import { CookingNotFoundError, startCookSession } from '@/lib/services/cooking-service';

export const runtime = 'nodejs';

export async function POST(request: Request) {
  if (!hasTrustedMutationOrigin(request))
    return jsonError(403, 'untrusted_origin', 'This change must come from a trusted app origin.');
  const actor = getActorContext((await cookies()).get(ACTIVE_PROFILE_COOKIE)?.value);
  if (!actor.profileId)
    return jsonError(409, 'profile_selection_required', 'Choose a household profile first.');
  const parsed = cookSessionStartSchema.safeParse(await request.json().catch(() => null));
  if (!parsed.success)
    return jsonError(400, 'invalid_cook_session', 'Use a valid recipe and serving count.');
  try {
    return NextResponse.json(
      {
        session: startCookSession(
          parsed.data.recipeId,
          actor.profileId,
          parsed.data.targetServings,
        ),
      },
      { status: 201 },
    );
  } catch (error) {
    if (error instanceof CookingNotFoundError)
      return jsonError(404, 'recipe_not_found', error.message);
    throw error;
  }
}
