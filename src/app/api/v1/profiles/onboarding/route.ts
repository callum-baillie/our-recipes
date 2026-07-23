import { NextResponse } from 'next/server';

import { profileOnboardingSchema } from '@/lib/domain/setup';
import { hasTrustedMutationOrigin, jsonError } from '@/lib/http';
import { ConflictError, onboardProfile } from '@/lib/services/household-service';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

export async function POST(request: Request) {
  if (!hasTrustedMutationOrigin(request)) {
    return jsonError(403, 'untrusted_origin', 'This change must come from a trusted app origin.');
  }
  const parsed = profileOnboardingSchema.safeParse(await request.json().catch(() => null));
  if (!parsed.success) {
    return jsonError(400, 'invalid_profile_onboarding', 'Check the highlighted profile details.');
  }
  try {
    return NextResponse.json({ profile: onboardProfile(parsed.data) }, { status: 201 });
  } catch (error) {
    if (error instanceof ConflictError)
      return jsonError(409, 'profile_onboarding_conflict', error.message);
    throw error;
  }
}
