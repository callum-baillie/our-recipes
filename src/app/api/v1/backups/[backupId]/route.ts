import { NextResponse } from 'next/server';

import { jsonError } from '@/lib/http';
import {
  BackupNotFoundError,
  BackupValidationError,
  previewBackup,
} from '@/lib/services/backup-service';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

export async function GET(_request: Request, context: { params: Promise<{ backupId: string }> }) {
  try {
    return NextResponse.json({ backup: await previewBackup((await context.params).backupId) });
  } catch (error) {
    if (error instanceof BackupNotFoundError)
      return jsonError(404, 'backup_not_found', error.message);
    if (error instanceof BackupValidationError)
      return jsonError(422, 'backup_invalid', error.message);
    throw error;
  }
}
