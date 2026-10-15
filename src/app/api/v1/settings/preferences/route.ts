import { withApiRequestId, authorizeCoreApi, actorFromPrincipal } from '@/lib/api-auth';

import { NextResponse } from 'next/server';

import { appPreferencesUpdateSchema } from '@/lib/domain/app-preferences';
import { jsonError } from '@/lib/http';
import {
  AppPreferencesConflictError,
  getAppPreferences,
  updateAppPreferences,
} from '@/lib/services/app-preferences-service';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

export async function GET(request: Request) {
  const access = await authorizeCoreApi(request);
  if (access.response) return access.response;

  return withApiRequestId(
    NextResponse.json({ preferences: getAppPreferences() }),
    access.requestId,
  );
}

export async function PATCH(request: Request) {
  const access = await authorizeCoreApi(request);
  if (access.response) return access.response;

  const actor = actorFromPrincipal(access.principal);
  if (!actor.profileId) {
    return withApiRequestId(
      jsonError(409, 'profile_selection_required', 'Choose a household profile first.'),
      access.requestId,
    );
  }
  const parsed = appPreferencesUpdateSchema.safeParse(await request.json().catch(() => null));
  if (!parsed.success) {
    return withApiRequestId(
      jsonError(400, 'invalid_app_preferences', 'Check the selected app defaults.'),
      access.requestId,
    );
  }
  try {
    return withApiRequestId(
      NextResponse.json({
        preferences: updateAppPreferences(parsed.data, actor.profileId),
      }),
      access.requestId,
    );
  } catch (error) {
    if (error instanceof AppPreferencesConflictError) {
      return withApiRequestId(
        jsonError(409, 'app_preferences_conflict', error.message),
        access.requestId,
      );
    }
    throw error;
  }
}
