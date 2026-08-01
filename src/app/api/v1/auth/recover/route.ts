import { NextResponse } from 'next/server';

import { hasTrustedMutationOrigin, jsonError } from '@/lib/http';
import { recoverAccountWithCode, RequestAuthError } from '@/lib/services/auth-service';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

export async function POST(request: Request) {
  if (!hasTrustedMutationOrigin(request)) {
    return jsonError(403, 'untrusted_origin', 'This change must come from a trusted app origin.');
  }
  try {
    await recoverAccountWithCode(await request.json().catch(() => null));
    return NextResponse.json({ recovered: true });
  } catch (error) {
    if (error instanceof RequestAuthError) {
      return jsonError(error.status, error.code, error.message);
    }
    return jsonError(
      400,
      'invalid_recovery_request',
      error instanceof Error ? error.message : 'Check the recovery details.',
    );
  }
}
