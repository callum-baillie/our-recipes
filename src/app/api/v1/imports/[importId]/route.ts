import { withApiRequestId, authorizeCoreApi } from '@/lib/api-auth';
import { NextResponse } from 'next/server';

import { jsonError } from '@/lib/http';
import { getImportOperation } from '@/lib/services/import-service';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

export async function GET(_request: Request, context: { params: Promise<{ importId: string }> }) {
  const access = await authorizeCoreApi(_request);
  if (access.response) return access.response;

  const { importId } = await context.params;
  try {
    const imported = getImportOperation(importId);
    return withApiRequestId(
      imported
        ? NextResponse.json(imported)
        : jsonError(404, 'import_not_found', 'That import draft no longer exists.'),
      access.requestId,
    );
  } catch {
    return withApiRequestId(
      jsonError(404, 'import_not_found', 'That import draft no longer exists.'),
      access.requestId,
    );
  }
}
