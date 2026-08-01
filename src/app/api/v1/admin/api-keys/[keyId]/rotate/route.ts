import { NextResponse } from 'next/server';

import { adminAuthError, requestId, withRequestId } from '@/app/api/v1/admin/api-keys/_shared';
import { hasTrustedMutationOrigin, jsonError } from '@/lib/http';
import { rotateAdminApiKey } from '@/lib/services/api-key-service';
import { requireAdminSession } from '@/lib/services/auth-service';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

export async function POST(request: Request, context: { params: Promise<{ keyId: string }> }) {
  const id = requestId(request);
  if (!hasTrustedMutationOrigin(request)) {
    return withRequestId(
      jsonError(403, 'untrusted_origin', 'This change must come from a trusted app origin.'),
      id,
    );
  }
  try {
    const [principal, params] = await Promise.all([requireAdminSession(request), context.params]);
    const rotated = await rotateAdminApiKey({
      userId: principal.userId,
      profileId: principal.profileId,
      keyId: params.keyId,
      requestId: id,
    });
    return withRequestId(NextResponse.json(rotated, { status: 201 }), id);
  } catch (error) {
    const response = adminAuthError(error);
    if (response) return withRequestId(response, id);
    if (error instanceof Error) {
      return withRequestId(jsonError(404, 'api_key_not_found', error.message), id);
    }
    throw error;
  }
}
