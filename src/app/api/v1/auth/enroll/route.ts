import { NextResponse } from 'next/server';
import { z } from 'zod';

import { auth } from '@/lib/auth/server';
import { getRuntimeConfig } from '@/lib/config';
import { profileCredentialsSchema } from '@/lib/domain/auth';
import { hasTrustedMutationOrigin, jsonError } from '@/lib/http';
import { enrollExistingProfiles, isAuthenticationConfigured } from '@/lib/services/auth-service';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

const enrollmentSchema = z
  .object({
    profiles: z
      .array(
        z
          .object({
            profileId: z.uuid(),
            credentials: profileCredentialsSchema,
          })
          .strict(),
      )
      .min(1)
      .max(12),
  })
  .strict();

export async function POST(request: Request) {
  if (!hasTrustedMutationOrigin(request)) {
    return jsonError(403, 'untrusted_origin', 'This change must come from a trusted app origin.');
  }
  if (isAuthenticationConfigured()) {
    return jsonError(409, 'authentication_already_configured', 'Authentication is already set up.');
  }
  const parsed = enrollmentSchema.safeParse(await request.json().catch(() => null));
  if (!parsed.success) {
    return jsonError(
      400,
      'invalid_security_enrollment',
      parsed.error.issues[0]?.message ?? 'Check every profile security field.',
    );
  }
  try {
    const enrollments = await enrollExistingProfiles(parsed.data.profiles);
    if (getRuntimeConfig().isProduction) {
      for (const entry of parsed.data.profiles) {
        void auth.api
          .sendVerificationEmail({
            body: { email: entry.credentials.email, callbackURL: '/sign-in?verified=1' },
            headers: request.headers,
          })
          .catch((error) => console.error('Could not queue a verification email.', error));
      }
    }
    return NextResponse.json({
      enrollments,
      requiresEmailVerification: getRuntimeConfig().isProduction,
    });
  } catch (error) {
    return jsonError(
      409,
      'security_enrollment_conflict',
      error instanceof Error ? error.message : 'The security upgrade could not be completed.',
    );
  }
}
