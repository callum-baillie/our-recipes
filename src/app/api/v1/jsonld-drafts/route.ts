import { withApiRequestId, authorizeCoreApi, actorFromPrincipal } from '@/lib/api-auth';

import { NextResponse } from 'next/server';

import { JsonLdValidationError, jsonLdDraftRequestSchema } from '@/lib/domain/jsonld';
import { jsonError } from '@/lib/http';
import { createJsonLdDraft, findJsonLdCandidates } from '@/lib/services/jsonld-service';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

export async function POST(request: Request) {
  const access = await authorizeCoreApi(request);
  if (access.response) return access.response;

  const actor = actorFromPrincipal(access.principal);
  if (!actor.profileId) {
    return withApiRequestId(
      jsonError(
        409,
        'profile_selection_required',
        'Choose a household profile before importing a portable recipe.',
      ),
      access.requestId,
    );
  }
  const declaredLength = Number(request.headers.get('content-length') ?? '0');
  if (declaredLength > 1_050_000) {
    return withApiRequestId(
      jsonError(413, 'source_too_large', 'Paste no more than 1 MB of JSON-LD.'),
      access.requestId,
    );
  }
  const parsed = jsonLdDraftRequestSchema.safeParse(await request.json().catch(() => null));
  if (!parsed.success)
    return withApiRequestId(
      jsonError(400, 'invalid_jsonld', 'Paste valid, bounded JSON-LD.'),
      access.requestId,
    );
  try {
    return withApiRequestId(
      NextResponse.json(
        parsed.data.candidateIndex === undefined
          ? { candidates: findJsonLdCandidates(parsed.data.source) }
          : { draft: createJsonLdDraft(parsed.data.source, parsed.data.candidateIndex) },
      ),
      access.requestId,
    );
  } catch (error) {
    if (error instanceof JsonLdValidationError)
      return withApiRequestId(jsonError(422, error.code, error.message), access.requestId);
    throw error;
  }
}
