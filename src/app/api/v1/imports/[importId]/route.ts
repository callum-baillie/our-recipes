import { NextResponse } from 'next/server';

import { jsonError } from '@/lib/http';
import { getImportOperation } from '@/lib/services/import-service';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

export async function GET(_request: Request, context: { params: Promise<{ importId: string }> }) {
  const { importId } = await context.params;
  try {
    const imported = getImportOperation(importId);
    return imported
      ? NextResponse.json(imported)
      : jsonError(404, 'import_not_found', 'That import draft no longer exists.');
  } catch {
    return jsonError(404, 'import_not_found', 'That import draft no longer exists.');
  }
}
