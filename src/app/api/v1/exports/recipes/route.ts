import { withApiRequestId, authorizeCoreApi, actorFromPrincipal } from '@/lib/api-auth';
import { createReadStream } from 'node:fs';
import { Readable } from 'node:stream';

import { NextResponse } from 'next/server';

import { PortableRecipeExportError } from '@/lib/domain/recipe-export';
import { jsonError } from '@/lib/http';
import { createPortableRecipeExport } from '@/lib/services/portable-recipe-export-service';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

export async function GET(request: Request) {
  const access = await authorizeCoreApi(request);
  if (access.response) return access.response;

  const actor = actorFromPrincipal(access.principal);
  if (!actor.profileId) {
    return withApiRequestId(
      jsonError(
        409,
        'profile_selection_required',
        'Choose a household profile before downloading the portable recipe export.',
      ),
      access.requestId,
    );
  }

  try {
    const portableExport = await createPortableRecipeExport();
    const stream = createReadStream(portableExport.archivePath);
    let released = false;
    const release = () => {
      if (released) return;
      released = true;
      void portableExport.cleanup().catch(() => undefined);
    };
    stream.once('close', release);
    stream.once('error', release);

    return withApiRequestId(
      new NextResponse(Readable.toWeb(stream) as ReadableStream, {
        headers: {
          'Cache-Control': 'no-store',
          'Content-Disposition': `attachment; filename="${portableExport.downloadName}"`,
          'Content-Length': String(portableExport.bytes),
          'Content-Type': 'application/gzip',
          'X-Content-Type-Options': 'nosniff',
        },
      }),
      access.requestId,
    );
  } catch (error) {
    if (error instanceof PortableRecipeExportError)
      return withApiRequestId(
        jsonError(422, 'portable_export_unavailable', error.message),
        access.requestId,
      );
    throw error;
  }
}
