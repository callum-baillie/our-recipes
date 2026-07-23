import { cookies } from 'next/headers';
import { NextResponse } from 'next/server';

import {
  ACTIVE_PROFILE_COOKIE,
  getActorContext,
  LEGACY_ACTIVE_PROFILE_COOKIE,
} from '@/lib/actor-context';
import { freshInstallConfirmationSchema } from '@/lib/domain/app-preferences';
import { hasTrustedMutationOrigin, jsonError } from '@/lib/http';
import {
  FreshInstallRefusedError,
  performFreshInstall,
} from '@/lib/services/fresh-install-service';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

export async function POST(request: Request) {
  if (!hasTrustedMutationOrigin(request)) {
    return jsonError(403, 'untrusted_origin', 'This change must come from a trusted app origin.');
  }
  const actor = getActorContext((await cookies()).get(ACTIVE_PROFILE_COOKIE)?.value);
  if (!actor.profileId) {
    return jsonError(409, 'profile_selection_required', 'Choose a household profile first.');
  }
  const parsed = freshInstallConfirmationSchema.safeParse(await request.json().catch(() => null));
  if (!parsed.success) {
    return jsonError(400, 'fresh_install_confirmation_required', 'Type FRESH INSTALL to continue.');
  }
  try {
    const result = await performFreshInstall();
    const response = NextResponse.json({ reset: true, ...result });
    response.cookies.set(ACTIVE_PROFILE_COOKIE, '', { path: '/', maxAge: 0, sameSite: 'lax' });
    response.cookies.set(LEGACY_ACTIVE_PROFILE_COOKIE, '', {
      path: '/',
      maxAge: 0,
      sameSite: 'lax',
    });
    return response;
  } catch (error) {
    if (error instanceof FreshInstallRefusedError) {
      return jsonError(409, 'fresh_install_refused', error.message);
    }
    throw error;
  }
}
