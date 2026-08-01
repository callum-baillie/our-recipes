import { NextResponse } from 'next/server';
import { readFile } from 'node:fs/promises';
import { join } from 'node:path';

import { LEGACY_ACTIVE_PROFILE_COOKIE } from '@/lib/actor-context';
import { auth } from '@/lib/auth/server';
import { getRuntimeConfig } from '@/lib/config';
import { setupSchema } from '@/lib/domain/setup';
import {
  SCOTTISH_STOVIES_IMAGE_ALT,
  SCOTTISH_STOVIES_IMAGE_PATH,
} from '@/lib/domain/example-recipes';
import { hasTrustedMutationOrigin, jsonError } from '@/lib/http';
import { prepareProfileEnrollment } from '@/lib/services/auth-service';
import { completeSetupWithResult, ConflictError } from '@/lib/services/household-service';
import { createRecipeImage } from '@/lib/services/recipe-image-service';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

export async function POST(request: Request) {
  if (!hasTrustedMutationOrigin(request)) {
    return jsonError(403, 'untrusted_origin', 'This change must come from a trusted app origin.');
  }

  const parsed = setupSchema.safeParse(await request.json().catch(() => null));
  if (!parsed.success)
    return jsonError(400, 'invalid_request', 'Check the highlighted setup details.');

  try {
    const credentialInputs = [
      'credentials' in parsed.data ? parsed.data.credentials : undefined,
      ...parsed.data.additionalProfiles.map((entry) =>
        'credentials' in entry ? entry.credentials : undefined,
      ),
    ];
    if (credentialInputs.some((credentials) => !credentials)) {
      return jsonError(
        400,
        'profile_credentials_required',
        'Every profile needs a unique email, a strong passphrase, and a six-digit PIN.',
      );
    }
    const normalizedEmails = credentialInputs.map((credentials) =>
      credentials!.email.trim().toLocaleLowerCase('en-US'),
    );
    if (new Set(normalizedEmails).size !== normalizedEmails.length) {
      return jsonError(
        409,
        'profile_email_conflict',
        'Every profile needs a different email address.',
      );
    }
    const displayNames = [
      parsed.data.profile.displayName,
      ...parsed.data.additionalProfiles.map((entry) => entry.profile.displayName),
    ];
    const enrollments = await Promise.all(
      credentialInputs.map((credentials, index) =>
        prepareProfileEnrollment(
          displayNames[index]!,
          credentials!,
          index === 0 ? 'admin' : parsed.data.additionalProfiles[index - 1]!.role,
        ),
      ),
    );
    const { state, firstRecipeId, recoveryCodes } = completeSetupWithResult(
      parsed.data,
      enrollments,
    );
    const activeProfile = state.profiles[0];
    if (firstRecipeId && activeProfile) {
      try {
        const imageBytes = await readFile(
          join(process.cwd(), 'public', SCOTTISH_STOVIES_IMAGE_PATH.replace(/^\//u, '')),
        );
        await createRecipeImage(
          firstRecipeId,
          activeProfile.id,
          imageBytes,
          SCOTTISH_STOVIES_IMAGE_ALT,
        );
      } catch (error) {
        console.error('The example Stovies recipe was created without its optional image.', error);
      }
    }
    const response = NextResponse.json(
      {
        household: state.household,
        profiles: state.profiles,
        firstRecipeId,
        recoveryCodes,
        requiresEmailVerification: getRuntimeConfig().isProduction,
      },
      { status: 201 },
    );
    response.cookies.set(LEGACY_ACTIVE_PROFILE_COOKIE, '', {
      path: '/',
      maxAge: 0,
      sameSite: 'lax',
    });
    if (getRuntimeConfig().isProduction) {
      for (const email of normalizedEmails) {
        void auth.api
          .sendVerificationEmail({
            body: { email, callbackURL: '/sign-in?verified=1' },
            headers: request.headers,
          })
          .catch((error) => console.error('Could not queue a profile verification email.', error));
      }
    }
    return response;
  } catch (error) {
    if (error instanceof ConflictError) return jsonError(409, 'already_configured', error.message);
    throw error;
  }
}
