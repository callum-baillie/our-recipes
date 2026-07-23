import { cookies } from 'next/headers';
import { NextResponse } from 'next/server';
import { ZodError } from 'zod';

import { ACTIVE_PROFILE_COOKIE, getActorContext } from '@/lib/actor-context';
import { hasTrustedMutationOrigin, jsonError } from '@/lib/http';
import {
  AiSettingsConflictError,
  AiSettingsValidationError,
  getAiSettings,
  updateAiSettings,
} from '@/lib/services/ai-settings-service';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

async function actorProfileId() {
  return getActorContext((await cookies()).get(ACTIVE_PROFILE_COOKIE)?.value).profileId;
}

export async function GET() {
  const profileId = await actorProfileId();
  if (!profileId)
    return jsonError(409, 'profile_selection_required', 'Choose a household profile first.');
  return NextResponse.json(getAiSettings(profileId));
}

export async function PATCH(request: Request) {
  if (!hasTrustedMutationOrigin(request))
    return jsonError(403, 'untrusted_origin', 'This change must come from a trusted app origin.');
  const profileId = await actorProfileId();
  if (!profileId)
    return jsonError(409, 'profile_selection_required', 'Choose a household profile first.');
  try {
    return NextResponse.json(updateAiSettings(profileId, await request.json().catch(() => null)));
  } catch (error) {
    if (error instanceof ZodError || error instanceof AiSettingsValidationError)
      return jsonError(400, 'invalid_ai_settings', error.message);
    if (error instanceof AiSettingsConflictError)
      return jsonError(409, 'ai_settings_conflict', error.message);
    throw error;
  }
}
