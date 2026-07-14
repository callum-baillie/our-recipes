import { NextResponse } from 'next/server';

import { captureRequestSchema, draftFromText } from '@/lib/domain/capture';
import { hasTrustedMutationOrigin, jsonError } from '@/lib/http';
import { CaptureCandidateNotFoundError, capturePublicUrl } from '@/lib/services/capture-service';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

export async function POST(request: Request) {
  if (!hasTrustedMutationOrigin(request))
    return jsonError(403, 'untrusted_origin', 'This capture must come from a trusted app origin.');
  const parsed = captureRequestSchema.safeParse(await request.json().catch(() => null));
  if (!parsed.success)
    return jsonError(400, 'invalid_capture', 'Paste enough recipe text or enter a valid URL.');
  try {
    if (parsed.data.kind === 'text')
      return NextResponse.json({ draft: draftFromText(parsed.data.text) });
    return NextResponse.json(await capturePublicUrl(parsed.data.url, parsed.data.candidateIndex));
  } catch (error) {
    if (error instanceof CaptureCandidateNotFoundError)
      return jsonError(422, 'capture_candidate_not_found', error.message);
    return jsonError(
      422,
      'capture_rejected',
      error instanceof Error ? error.message : 'The source could not be captured safely.',
    );
  }
}
