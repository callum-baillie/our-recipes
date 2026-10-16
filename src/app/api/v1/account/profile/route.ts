import { NextResponse } from 'next/server';
import { getAuthenticatedSessionPrincipal } from '@/lib/services/auth-service';
import { updateProfile } from '@/lib/services/household-service';
import { profileUpdateSchema } from '@/lib/domain/setup';
import { hasTrustedMutationOrigin, jsonError } from '@/lib/http';
export async function PATCH(request: Request) {
  if (!hasTrustedMutationOrigin(request))
    return jsonError(403, 'untrusted_origin', 'Use a trusted app origin.');
  const principal = await getAuthenticatedSessionPrincipal(request);
  if (!principal?.linkedProfileId)
    return jsonError(401, 'authentication_required', 'Sign in to update your profile.');
  const input = profileUpdateSchema.strict().safeParse(await request.json().catch(() => null));
  if (!input.success) return jsonError(400, 'invalid_profile', 'Check your profile details.');
  try {
    new Intl.DateTimeFormat(input.data.locale, { timeZone: input.data.timezone });
  } catch {
    return jsonError(400, 'invalid_region', 'Choose a valid locale and time zone.');
  }
  return NextResponse.json({ profile: updateProfile(principal.linkedProfileId, input.data) });
}
