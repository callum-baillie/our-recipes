import { adminRequestError } from '@/lib/services/admin-request-service';
import { NextResponse } from 'next/server';

import { hasTrustedMutationOrigin, jsonError } from '@/lib/http';
import { createBackup, listBackups } from '@/lib/services/backup-service';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

export async function GET(request: Request) {
  const accessError = await adminRequestError(request);
  if (accessError) return accessError;
  return NextResponse.json({ backups: await listBackups() });
}

export async function POST(request: Request) {
  const accessError = await adminRequestError(request);
  if (accessError) return accessError;
  if (!hasTrustedMutationOrigin(request)) {
    return jsonError(403, 'untrusted_origin', 'This change must come from a trusted app origin.');
  }

  const backup = await createBackup('manual');
  return NextResponse.json({ backup }, { status: 201 });
}
