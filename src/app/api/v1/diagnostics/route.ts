import { cookies } from 'next/headers';
import { NextResponse } from 'next/server';

import { ACTIVE_PROFILE_COOKIE, getActorContext } from '@/lib/actor-context';
import { listRedactedApplicationErrors } from '@/lib/application-errors';
import { hasTrustedMutationOrigin, jsonError } from '@/lib/http';
import { getRedactedRuntimeDiagnostics, getReleaseStatus } from '@/lib/release';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

export async function POST(request: Request) {
  if (!hasTrustedMutationOrigin(request)) {
    return jsonError(403, 'untrusted_origin', 'This export must come from a trusted app origin.');
  }
  const actor = getActorContext((await cookies()).get(ACTIVE_PROFILE_COOKIE)?.value);
  if (!actor.profileId) {
    return jsonError(
      409,
      'profile_selection_required',
      'Choose a household profile before exporting diagnostics.',
    );
  }
  return NextResponse.json({
    generatedAt: new Date().toISOString(),
    release: getReleaseStatus(),
    runtime: getRedactedRuntimeDiagnostics(),
    recentErrors: listRedactedApplicationErrors(),
    privacy:
      'This default bundle excludes household names, profile names, recipes, plans, lists, Pantry contents, Nutrition records, filesystem paths, origins, and secret values.',
  });
}
