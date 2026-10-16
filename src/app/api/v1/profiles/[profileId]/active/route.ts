import { z } from 'zod';
import { NextResponse } from 'next/server';

import {
  ACTIVE_PROFILE_COOKIE,
  createSignedProfileValue,
  LEGACY_ACTIVE_PROFILE_COOKIE,
} from '@/lib/actor-context';
import { getRuntimeConfig } from '@/lib/config';
import { profilePasswordSwitchSchema } from '@/lib/domain/auth';
import { isRoleElevation } from '@/lib/domain/permissions';
import { hasTrustedMutationOrigin, jsonError } from '@/lib/http';
import {
  getAuthenticatedSessionPrincipal,
  getProfileAccessRole,
  verifyProfilePassword,
} from '@/lib/services/auth-service';
import { getProfile } from '@/lib/services/household-service';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

export async function PATCH(request: Request, context: { params: Promise<{ profileId: string }> }) {
  if (!hasTrustedMutationOrigin(request)) {
    return jsonError(403, 'untrusted_origin', 'This change must come from a trusted app origin.');
  }
  const principal = await getAuthenticatedSessionPrincipal(request);
  if (!principal || !principal.sessionId) {
    return jsonError(401, 'authentication_required', 'Sign in before switching profiles.');
  }
  const parsed = profilePasswordSwitchSchema.safeParse(await request.json().catch(() => null));
  if (!parsed.success) {
    return jsonError(
      400,
      'invalid_profile_password',
      'Enter the password for the destination profile.',
    );
  }
  const { profileId } = await context.params;
  if (!z.string().uuid().safeParse(profileId).success)
    return jsonError(400, 'invalid_profile_id', 'Choose a valid profile.');
  const profile = getProfile(profileId);
  if (!profile)
    return jsonError(404, 'profile_not_found', 'That household profile no longer exists.');
  const targetRole = getProfileAccessRole(profileId);
  if (!targetRole) {
    return jsonError(409, 'profile_security_required', 'That profile is not secured yet.');
  }
  if (isRoleElevation(principal.accountRole, targetRole)) {
    return jsonError(
      403,
      'reauthentication_required',
      `Sign in with ${profile.displayName}'s full passphrase or passkey to use ${targetRole} access.`,
    );
  }
  const verified = await verifyProfilePassword({
    sessionId: principal.sessionId,
    userId: principal.userId,
    profileId,
    password: parsed.data.password,
    requestId: request.headers.get('x-request-id') ?? undefined,
  });
  if (!verified.ok) {
    const response = jsonError(
      verified.retryAfterSeconds ? 429 : 401,
      verified.retryAfterSeconds ? 'profile_password_locked' : 'invalid_profile_password',
      verified.retryAfterSeconds
        ? 'Too many attempts. Wait before trying this profile again.'
        : 'That password is not correct.',
    );
    if (verified.retryAfterSeconds) {
      response.headers.set('Retry-After', String(verified.retryAfterSeconds));
    }
    return response;
  }

  const currentPrincipal = await getAuthenticatedSessionPrincipal(request);
  const currentRole = getProfileAccessRole(profileId);
  if (
    !currentPrincipal ||
    currentPrincipal.sessionId !== principal.sessionId ||
    !currentRole ||
    isRoleElevation(currentPrincipal.accountRole, currentRole)
  )
    return jsonError(
      403,
      'reauthentication_required',
      'Sign in again before switching to this profile.',
    );
  const response = NextResponse.json({ profile });
  response.cookies.set(
    ACTIVE_PROFILE_COOKIE,
    createSignedProfileValue(profile.id, principal.sessionId),
    {
      httpOnly: true,
      sameSite: 'lax',
      secure: new URL(getRuntimeConfig().auth.baseUrl).protocol === 'https:',
      path: '/',
      maxAge: 60 * 60 * 24 * 30,
    },
  );
  response.cookies.set(LEGACY_ACTIVE_PROFILE_COOKIE, '', {
    path: '/',
    maxAge: 0,
    sameSite: 'lax',
  });
  return response;
}
