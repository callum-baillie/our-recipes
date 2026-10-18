import { NextResponse } from 'next/server';
import { ZodError } from 'zod';
import {
  getAuthenticatedSessionPrincipal,
  RequestAuthError,
  requireAdminSession,
} from '@/lib/services/auth-service';
import { hasTrustedMutationOrigin, jsonError } from '@/lib/http';
import {
  AiSettingsConflictError,
  AiSettingsValidationError,
  getGlobalAiSettings,
  getPersonalAiSettings,
  saveGlobalAiSettings,
  savePersonalAiSettings,
} from '@/lib/services/ai-settings-service';
export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';
async function handle(request: Request, mutate: boolean) {
  if (mutate && !hasTrustedMutationOrigin(request))
    return jsonError(403, 'untrusted_origin', 'Use a trusted app origin.');
  try {
    const global = new URL(request.url).searchParams.get('scope') === 'global';
    const principal = global
      ? await requireAdminSession(request, { fresh: false })
      : await getAuthenticatedSessionPrincipal(request);
    if (!principal)
      return jsonError(401, 'authentication_required', 'Sign in to manage AI settings.');
    const profileId = principal.linkedProfileId;
    const result = mutate
      ? global
        ? saveGlobalAiSettings(profileId, await request.json())
        : savePersonalAiSettings(principal.userId, profileId, await request.json())
      : global
        ? getGlobalAiSettings(profileId)
        : getPersonalAiSettings(principal.userId, profileId);
    return NextResponse.json(result, { headers: { 'Cache-Control': 'private, no-store' } });
  } catch (error) {
    if (error instanceof RequestAuthError)
      return jsonError(error.status, error.code, error.message);
    if (error instanceof AiSettingsConflictError)
      return jsonError(409, 'ai_settings_conflict', error.message);
    if (
      error instanceof ZodError ||
      error instanceof AiSettingsValidationError ||
      error instanceof SyntaxError
    )
      return jsonError(400, 'invalid_ai_settings', error.message);
    throw error;
  }
}
export async function GET(request: Request) {
  return handle(request, false);
}
export async function PATCH(request: Request) {
  return handle(request, true);
}
