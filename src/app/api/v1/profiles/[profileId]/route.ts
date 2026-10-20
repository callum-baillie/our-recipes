import { NextResponse } from 'next/server';

import { appRoleCan } from '@/lib/domain/permissions';
import { profileUpdateSchema, profileIdentityUpdateSchema } from '@/lib/domain/setup';
import { hasTrustedMutationOrigin, jsonError } from '@/lib/http';
import {
  ConflictError,
  NotFoundError,
  setProfileArchived,
  updateProfile,
} from '@/lib/services/household-service';
import {
  countActiveAdmins,
  getProfileAccessRole,
  getAuthenticatedSessionPrincipal,
} from '@/lib/services/auth-service';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

export async function PATCH(request: Request, context: { params: Promise<{ profileId: string }> }) {
  if (!hasTrustedMutationOrigin(request)) {
    return jsonError(403, 'untrusted_origin', 'This change must come from a trusted app origin.');
  }
  const principal = await getAuthenticatedSessionPrincipal(request);
  if (!principal)
    return jsonError(401, 'authentication_required', 'Sign in to manage household profiles.');
  if (
    !appRoleCan(principal.role, 'profiles.manage') ||
    principal.profileId !== principal.linkedProfileId
  )
    return jsonError(
      403,
      'admin_required',
      'Switch to your own administrator profile to manage household profiles.',
    );
  const { profileId } = await context.params;
  const parsed = profileIdentityUpdateSchema
    .or(profileUpdateSchema.strict())
    .safeParse(await request.json().catch(() => null));
  if (!parsed.success) return jsonError(400, 'invalid_profile', 'Check the profile details.');
  if (!('scope' in parsed.data)) {
    if (principal?.linkedProfileId !== profileId)
      return jsonError(
        403,
        'personal_profile_scope',
        'Personal preferences belong to the signed-in account. Use an identity-only update for household members.',
      );
  }
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
  const principal = await getAuthenticatedSessionPrincipal(request);
  if (!principal)
    return jsonError(401, 'authentication_required', 'Sign in to manage household profiles.');
  if (
    !appRoleCan(principal.role, 'profiles.manage') ||
    principal.profileId !== principal.linkedProfileId
  )
    return jsonError(
      403,
      'admin_required',
      'Switch to your own administrator profile to manage household profiles.',
    );
  const body = (await request.json().catch(() => null)) as { archived?: unknown } | null;
  if (typeof body?.archived !== 'boolean') {
    return jsonError(400, 'invalid_profile_archive', 'Choose whether this profile is archived.');
  }
  const { profileId } = await context.params;
  if (body.archived && principal.profileId === profileId) {
    return jsonError(
      409,
      'active_profile_archive',
      'Switch to another active profile before archiving this one.',
    );
  }
  if (body.archived && getProfileAccessRole(profileId) === 'admin' && countActiveAdmins() <= 1) {
    return jsonError(
      409,
      'last_admin_required',
      'Promote another active profile to Admin before archiving this one.',
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
