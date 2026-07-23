import { cookies } from 'next/headers';
import { NextResponse } from 'next/server';

import { ACTIVE_PROFILE_COOKIE, getActorContext } from '@/lib/actor-context';
import { hasTrustedMutationOrigin, jsonError } from '@/lib/http';
import {
  PantryConflictError,
  PantryNotFoundError,
  PantryValidationError,
} from '@/lib/services/pantry-service';

export function rejectUntrustedPantryMutation(request: Request): NextResponse | null {
  return hasTrustedMutationOrigin(request)
    ? null
    : jsonError(403, 'untrusted_origin', 'This change must come from a trusted app origin.');
}

export async function requirePantryActor(): Promise<
  { profileId: string; response?: never } | { profileId?: never; response: NextResponse }
> {
  const actor = getActorContext((await cookies()).get(ACTIVE_PROFILE_COOKIE)?.value);
  return actor.profileId
    ? { profileId: actor.profileId }
    : {
        response: jsonError(
          409,
          'profile_selection_required',
          'Choose a household profile before changing Pantry stock.',
        ),
      };
}

export function pantryServiceError(error: unknown): NextResponse | null {
  if (error instanceof PantryNotFoundError)
    return jsonError(404, 'pantry_not_found', error.message);
  if (error instanceof PantryConflictError) return jsonError(409, 'pantry_conflict', error.message);
  if (error instanceof PantryValidationError)
    return jsonError(400, 'invalid_pantry_change', error.message);
  return null;
}
