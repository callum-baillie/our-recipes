import { createReadStream } from 'node:fs';
import { Readable } from 'node:stream';

import { cookies } from 'next/headers';
import { NextResponse } from 'next/server';

import { ACTIVE_PROFILE_COOKIE, getActorContext } from '@/lib/actor-context';
import { PortableRecipeExportError } from '@/lib/domain/recipe-export';
import { hasTrustedMutationOrigin, jsonError } from '@/lib/http';
import { createPortableRecipeExport } from '@/lib/services/portable-recipe-export-service';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

export async function GET(request: Request) {
  if (request.headers.get('origin') && !hasTrustedMutationOrigin(request)) {
    return jsonError(403, 'untrusted_origin', 'This download must come from a trusted app origin.');
  }
  const actor = getActorContext((await cookies()).get(ACTIVE_PROFILE_COOKIE)?.value);
  if (!actor.profileId) {
    return jsonError(
      409,
      'profile_selection_required',
      'Choose a household profile before downloading the portable recipe export.',
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

    return new NextResponse(Readable.toWeb(stream) as ReadableStream, {
      headers: {
        'Cache-Control': 'no-store',
        'Content-Disposition': `attachment; filename="${portableExport.downloadName}"`,
        'Content-Length': String(portableExport.bytes),
        'Content-Type': 'application/gzip',
        'X-Content-Type-Options': 'nosniff',
      },
    });
  } catch (error) {
    if (error instanceof PortableRecipeExportError)
      return jsonError(422, 'portable_export_unavailable', error.message);
    throw error;
  }
}
