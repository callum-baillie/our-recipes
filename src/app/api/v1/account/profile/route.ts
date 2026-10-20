import { NextResponse } from 'next/server';
import { getAuthenticatedSessionPrincipal } from '@/lib/services/auth-service';
import {
  ConflictError,
  NotFoundError,
  readPersonalProfile,
  updatePersonalProfile,
} from '@/lib/services/household-service';
import { personalProfileUpdateSchema } from '@/lib/domain/setup';
import { hasTrustedMutationOrigin, jsonError } from '@/lib/http';
export async function GET(request: Request) {
  const principal = await getAuthenticatedSessionPrincipal(request);
  if (!principal?.linkedProfileId)
    return jsonError(401, 'authentication_required', 'Sign in to read your profile.');
  try {
    return NextResponse.json(readPersonalProfile(principal.linkedProfileId), {
      headers: { 'Cache-Control': 'private, no-store' },
    });
  } catch (error) {
    if (error instanceof NotFoundError) return jsonError(404, 'profile_not_found', error.message);
    throw error;
  }
}
export async function PATCH(request: Request) {
  if (!hasTrustedMutationOrigin(request))
    return jsonError(403, 'untrusted_origin', 'Use a trusted app origin.');
  const principal = await getAuthenticatedSessionPrincipal(request);
  if (!principal?.linkedProfileId)
    return jsonError(401, 'authentication_required', 'Sign in to update your profile.');
  const input = personalProfileUpdateSchema.safeParse(await request.json().catch(() => null));
  if (!input.success)
    return jsonError(
      400,
      'invalid_profile',
      'Check your profile details. Questionnaire answers must be saved separately.',
    );
  try {
    return NextResponse.json(updatePersonalProfile(principal.linkedProfileId, input.data));
  } catch (error) {
    if (error instanceof ConflictError) return jsonError(409, 'profile_conflict', error.message);
    if (error instanceof NotFoundError) return jsonError(404, 'profile_not_found', error.message);
    throw error;
  }
}
