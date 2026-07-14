import { cookies } from 'next/headers';
import { NextResponse } from 'next/server';

import { ACTIVE_PROFILE_COOKIE, getActorContext } from '@/lib/actor-context';
import { profileUpdateSchema } from '@/lib/domain/setup';
import { hasTrustedMutationOrigin, jsonError } from '@/lib/http';
import {
  ConflictError,
  NotFoundError,
  setProfileArchived,
  updateProfile,
} from '@/lib/services/household-service';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

export async function PATCH(request: Request, context: { params: Promise<{ profileId: string }> }) {
  if (!hasTrustedMutationOrigin(request)) {
    return jsonError(403, 'untrusted_origin', 'This change must come from a trusted app origin.');
  }
  const { profileId } = await context.params;
  const parsed = profileUpdateSchema.safeParse(await request.json().catch(() => null));
  if (!parsed.success) return jsonError(400, 'invalid_profile', 'Check the profile details.');
  try {
    return NextResponse.json({ profile: updateProfile(profileId, parsed.data) });
  } catch (error) {
    if (error instanceof NotFoundError) return jsonError(404, 'profile_not_found', error.message);
    throw error;
  }
}

export async function POST(request: Request, context: { params: Promise<{ profileId: string }> }) {
  if (!hasTrustedMutationOrigin(request)) {
    return jsonError(403, 'untrusted_origin', 'This change must come from a trusted app origin.');
  }
  const body = (await request.json().catch(() => null)) as { archived?: unknown } | null;
  if (typeof body?.archived !== 'boolean') {
    return jsonError(400, 'invalid_profile_archive', 'Choose whether this profile is archived.');
  }
  const { profileId } = await context.params;
  const actor = getActorContext((await cookies()).get(ACTIVE_PROFILE_COOKIE)?.value);
  if (body.archived && actor.profileId === profileId) {
    return jsonError(
      409,
      'active_profile_archive',
      'Switch to another active profile before archiving this one.',
    );
  }
  try {
    return NextResponse.json({ profile: setProfileArchived(profileId, body.archived) });
  } catch (error) {
    if (error instanceof NotFoundError) return jsonError(404, 'profile_not_found', error.message);
    if (error instanceof ConflictError)
      return jsonError(409, 'profile_archive_refused', error.message);
    throw error;
  }
}
