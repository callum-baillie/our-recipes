import { withApiRequestId, authorizeCoreApi } from '@/lib/api-auth';
import { NextResponse } from 'next/server';

import { captureRequestSchema, draftFromText } from '@/lib/domain/capture';
import { jsonError } from '@/lib/http';
import { CaptureCandidateNotFoundError, capturePublicUrl } from '@/lib/services/capture-service';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

export async function POST(request: Request) {
  const access = await authorizeCoreApi(request);
  if (access.response) return access.response;

  const parsed = captureRequestSchema.safeParse(await request.json().catch(() => null));
  if (!parsed.success)
    return withApiRequestId(
      jsonError(400, 'invalid_capture', 'Paste enough recipe text or enter a valid URL.'),
      access.requestId,
    );
  try {
    if (parsed.data.kind === 'text')
      return withApiRequestId(
        NextResponse.json({ draft: draftFromText(parsed.data.text) }),
        access.requestId,
      );
    return withApiRequestId(
      NextResponse.json(await capturePublicUrl(parsed.data.url, parsed.data.candidateIndex)),
      access.requestId,
    );
  } catch (error) {
    if (error instanceof CaptureCandidateNotFoundError)
      return withApiRequestId(
        jsonError(422, 'capture_candidate_not_found', error.message),
        access.requestId,
      );
    return withApiRequestId(
      jsonError(
        422,
        'capture_rejected',
        error instanceof Error ? error.message : 'The source could not be captured safely.',
      ),
      access.requestId,
    );
  }
}
