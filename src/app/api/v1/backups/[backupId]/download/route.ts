import { adminRequestError } from '@/lib/services/admin-request-service';
import { NextResponse } from 'next/server';
import { createReadStream } from 'node:fs';
import { stat } from 'node:fs/promises';
import { Readable } from 'node:stream';

import { jsonError } from '@/lib/http';
import { BackupNotFoundError, getBackupArchivePath } from '@/lib/services/backup-service';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

export async function GET(request: Request, context: { params: Promise<{ backupId: string }> }) {
  const accessError = await adminRequestError(request);
  if (accessError) return accessError;

  try {
    const id = (await context.params).backupId;
    const filePath = await getBackupArchivePath(id);
    const details = await stat(filePath);
    return new NextResponse(Readable.toWeb(createReadStream(filePath)) as ReadableStream, {
      headers: {
        'Cache-Control': 'no-store',
        'Content-Disposition': `attachment; filename="bord-${id}.tar.gz"`,
        'Content-Length': String(details.size),
        'Content-Type': 'application/gzip',
        'X-Content-Type-Options': 'nosniff',
      },
    });
  } catch (error) {
    if (error instanceof BackupNotFoundError)
      return jsonError(404, 'backup_not_found', error.message);
    throw error;
  }
}
