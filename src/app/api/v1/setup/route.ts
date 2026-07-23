import { NextResponse } from 'next/server';

import {
  ACTIVE_PROFILE_COOKIE,
  createSignedProfileValue,
  LEGACY_ACTIVE_PROFILE_COOKIE,
} from '@/lib/actor-context';
import { getRuntimeConfig } from '@/lib/config';
import { setupSchema } from '@/lib/domain/setup';
import { hasTrustedMutationOrigin, jsonError } from '@/lib/http';
import { completeSetup, ConflictError } from '@/lib/services/household-service';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

export async function POST(request: Request) {
  if (!hasTrustedMutationOrigin(request)) {
    return jsonError(403, 'untrusted_origin', 'This change must come from a trusted app origin.');
  }

  const parsed = setupSchema.safeParse(await request.json().catch(() => null));
  if (!parsed.success)
    return jsonError(400, 'invalid_request', 'Check the highlighted setup details.');

  try {
    const state = completeSetup(parsed.data);
    const activeProfile = state.profiles[0];
    const response = NextResponse.json(
      { household: state.household, profiles: state.profiles },
      { status: 201 },
    );
    if (activeProfile) {
      response.cookies.set(ACTIVE_PROFILE_COOKIE, createSignedProfileValue(activeProfile.id), {
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
    }
    return response;
  } catch (error) {
    if (error instanceof ConflictError) return jsonError(409, 'already_configured', error.message);
    throw error;
  }
}
