import { withApiRequestId, authorizeCoreApi } from '@/lib/api-auth';
import { NextResponse } from 'next/server';

import { jsonError } from '@/lib/http';
import { ImportNotFoundError, getImportArtifact } from '@/lib/services/import-service';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

export async function GET(_request: Request, context: { params: Promise<{ importId: string }> }) {
  const access = await authorizeCoreApi(_request);
  if (access.response) return access.response;

  try {
    const { importId } = await context.params;
    const artifact = await getImportArtifact(importId);
    return withApiRequestId(
      new NextResponse(new Uint8Array(artifact.bytes), {
        headers: {
          'Content-Type': artifact.mediaType,
          'Content-Disposition': artifact.mediaType === 'application/pdf' ? 'attachment' : 'inline',
          'Cache-Control': 'private, no-store',
          'X-Content-Type-Options': 'nosniff',
        },
      }),
      access.requestId,
    );
  } catch (error) {
    if (error instanceof ImportNotFoundError)
      return withApiRequestId(jsonError(404, 'import_not_found', error.message), access.requestId);
    return withApiRequestId(
      jsonError(404, 'import_not_found', 'That import artifact no longer exists.'),
      access.requestId,
    );
  }
}
