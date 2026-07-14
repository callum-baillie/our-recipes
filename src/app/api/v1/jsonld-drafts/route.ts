import { cookies } from 'next/headers';
import { NextResponse } from 'next/server';

import { ACTIVE_PROFILE_COOKIE, getActorContext } from '@/lib/actor-context';
import { JsonLdValidationError, jsonLdDraftRequestSchema } from '@/lib/domain/jsonld';
import { hasTrustedMutationOrigin, jsonError } from '@/lib/http';
import { createJsonLdDraft, findJsonLdCandidates } from '@/lib/services/jsonld-service';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

export async function POST(request: Request) {
  if (!hasTrustedMutationOrigin(request)) {
    return jsonError(403, 'untrusted_origin', 'This draft must come from a trusted app origin.');
  }
  const actor = getActorContext((await cookies()).get(ACTIVE_PROFILE_COOKIE)?.value);
  if (!actor.profileId) {
    return jsonError(
      409,
      'profile_selection_required',
      'Choose a household profile before importing a portable recipe.',
    );
  }
  const declaredLength = Number(request.headers.get('content-length') ?? '0');
  if (declaredLength > 1_050_000) {
    return jsonError(413, 'source_too_large', 'Paste no more than 1 MB of JSON-LD.');
  }
  const parsed = jsonLdDraftRequestSchema.safeParse(await request.json().catch(() => null));
  if (!parsed.success) return jsonError(400, 'invalid_jsonld', 'Paste valid, bounded JSON-LD.');
  try {
    return NextResponse.json(
      parsed.data.candidateIndex === undefined
        ? { candidates: findJsonLdCandidates(parsed.data.source) }
        : { draft: createJsonLdDraft(parsed.data.source, parsed.data.candidateIndex) },
    );
  } catch (error) {
    if (error instanceof JsonLdValidationError) return jsonError(422, error.code, error.message);
    throw error;
  }
}
