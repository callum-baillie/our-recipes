import { NextResponse } from 'next/server';

import {
  ACTIVE_PROFILE_COOKIE,
  createSignedProfileValue,
  LEGACY_ACTIVE_PROFILE_COOKIE,
} from '@/lib/actor-context';
import { getRuntimeConfig } from '@/lib/config';
import { hasTrustedMutationOrigin, jsonError } from '@/lib/http';
import { getProfile } from '@/lib/services/household-service';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

export async function PATCH(request: Request, context: { params: Promise<{ profileId: string }> }) {
  if (!hasTrustedMutationOrigin(request)) {
    return jsonError(403, 'untrusted_origin', 'This change must come from a trusted app origin.');
  }
  const { profileId } = await context.params;
  const profile = getProfile(profileId);
  if (!profile)
    return jsonError(404, 'profile_not_found', 'That household profile no longer exists.');

  const response = NextResponse.json({ profile });
  response.cookies.set(ACTIVE_PROFILE_COOKIE, createSignedProfileValue(profile.id), {
    httpOnly: true,
    sameSite: 'lax',
    secure: getRuntimeConfig().isProduction,
    path: '/',
    maxAge: 60 * 60 * 24 * 365,
  });
  response.cookies.set(LEGACY_ACTIVE_PROFILE_COOKIE, '', {
    path: '/',
    maxAge: 0,
    sameSite: 'lax',
  });
  return response;
}
