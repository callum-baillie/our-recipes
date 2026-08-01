import { NextResponse } from 'next/server';

import { auth } from '@/lib/auth/server';
import { getRuntimeConfig } from '@/lib/config';
import { secureProfileOnboardingSchema } from '@/lib/domain/setup';
import { hasTrustedMutationOrigin, jsonError } from '@/lib/http';
import {
  prepareProfileEnrollment,
  RequestAuthError,
  requireAdminSession,
} from '@/lib/services/auth-service';
import { ConflictError, onboardProfileWithEnrollment } from '@/lib/services/household-service';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

export async function POST(request: Request) {
  if (!hasTrustedMutationOrigin(request)) {
    return jsonError(403, 'untrusted_origin', 'This change must come from a trusted app origin.');
  }
  try {
    await requireAdminSession(request, { fresh: false });
  } catch (error) {
    if (error instanceof RequestAuthError) {
      return jsonError(error.status, error.code, error.message);
    }
    throw error;
  }
  const parsed = secureProfileOnboardingSchema.safeParse(await request.json().catch(() => null));
  if (!parsed.success) {
    return jsonError(400, 'invalid_profile_onboarding', 'Check the highlighted profile details.');
  }
  if (!parsed.data.credentials) {
    return jsonError(
      400,
      'profile_credentials_required',
      'Add an email, strong passphrase, and six-digit PIN.',
    );
  }
  try {
    const enrollment = await prepareProfileEnrollment(
      parsed.data.profile.displayName,
      parsed.data.credentials,
      parsed.data.role,
    );
    const result = onboardProfileWithEnrollment(parsed.data, enrollment);
    if (getRuntimeConfig().isProduction) {
      void auth.api
        .sendVerificationEmail({
          body: {
            email: parsed.data.credentials.email,
            callbackURL: '/sign-in?verified=1',
          },
          headers: request.headers,
        })
        .catch((error) => console.error('Could not queue the verification email.', error));
    }
    return NextResponse.json(
      { ...result, requiresEmailVerification: getRuntimeConfig().isProduction },
      { status: 201 },
    );
  } catch (error) {
    if (error instanceof ConflictError)
      return jsonError(409, 'profile_onboarding_conflict', error.message);
    throw error;
  }
}
