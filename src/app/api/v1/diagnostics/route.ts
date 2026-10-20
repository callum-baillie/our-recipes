import { adminRequestError } from '@/lib/services/admin-request-service';
import { NextResponse } from 'next/server';

import { listRedactedApplicationErrors } from '@/lib/application-errors';
import { hasTrustedMutationOrigin, jsonError } from '@/lib/http';
import { getRedactedRuntimeDiagnostics, getReleaseStatus } from '@/lib/release';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

export async function POST(request: Request) {
  const accessError = await adminRequestError(request);
  if (accessError) return accessError;
  if (!hasTrustedMutationOrigin(request)) {
    return jsonError(403, 'untrusted_origin', 'This export must come from a trusted app origin.');
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
