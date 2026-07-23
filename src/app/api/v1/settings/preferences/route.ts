import { cookies } from 'next/headers';
import { NextResponse } from 'next/server';

import { ACTIVE_PROFILE_COOKIE, getActorContext } from '@/lib/actor-context';
import { appPreferencesUpdateSchema } from '@/lib/domain/app-preferences';
import { hasTrustedMutationOrigin, jsonError } from '@/lib/http';
import {
  AppPreferencesConflictError,
  getAppPreferences,
  updateAppPreferences,
} from '@/lib/services/app-preferences-service';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

export function GET() {
  return NextResponse.json({ preferences: getAppPreferences() });
}

export async function PATCH(request: Request) {
  if (!hasTrustedMutationOrigin(request)) {
    return jsonError(403, 'untrusted_origin', 'This change must come from a trusted app origin.');
  }
  const actor = getActorContext((await cookies()).get(ACTIVE_PROFILE_COOKIE)?.value);
  if (!actor.profileId) {
    return jsonError(409, 'profile_selection_required', 'Choose a household profile first.');
  }
  const parsed = appPreferencesUpdateSchema.safeParse(await request.json().catch(() => null));
  if (!parsed.success) {
    return jsonError(400, 'invalid_app_preferences', 'Check the selected app defaults.');
  }
  try {
    return NextResponse.json({
      preferences: updateAppPreferences(parsed.data, actor.profileId),
    });
  } catch (error) {
    if (error instanceof AppPreferencesConflictError) {
      return jsonError(409, 'app_preferences_conflict', error.message);
    }
    throw error;
  }
}
