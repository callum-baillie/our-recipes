import { NextResponse } from 'next/server';

import { adminAuthError, requestId, withRequestId } from '@/app/api/v1/admin/api-keys/_shared';
import { updateApiKeySchema } from '@/lib/domain/auth';
import { hasTrustedMutationOrigin, jsonError } from '@/lib/http';
import { revokeAdminApiKey, updateAdminApiKey } from '@/lib/services/api-key-service';
import { requireAdminSession } from '@/lib/services/auth-service';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

export async function PATCH(request: Request, context: { params: Promise<{ keyId: string }> }) {
  const id = requestId(request);
  if (!hasTrustedMutationOrigin(request)) {
    return withRequestId(
      jsonError(403, 'untrusted_origin', 'This change must come from a trusted app origin.'),
      id,
    );
  }
  const parsed = updateApiKeySchema.safeParse(await request.json().catch(() => null));
  if (!parsed.success) {
    return withRequestId(
      jsonError(
        400,
        'invalid_api_key_update',
        parsed.error.issues[0]?.message ?? 'Check the API key changes.',
      ),
      id,
    );
  }
  try {
    const [principal, params] = await Promise.all([requireAdminSession(request), context.params]);
    const apiKey = updateAdminApiKey({
      userId: principal.userId,
      profileId: principal.profileId,
      keyId: params.keyId,
      ...parsed.data,
      requestId: id,
    });
    return withRequestId(NextResponse.json({ apiKey }), id);
  } catch (error) {
    const response = adminAuthError(error);
    if (response) return withRequestId(response, id);
    if (error instanceof Error) {
      return withRequestId(jsonError(404, 'api_key_not_found', error.message), id);
    }
    throw error;
  }
}

export async function DELETE(request: Request, context: { params: Promise<{ keyId: string }> }) {
  const id = requestId(request);
  if (!hasTrustedMutationOrigin(request)) {
    return withRequestId(
      jsonError(403, 'untrusted_origin', 'This change must come from a trusted app origin.'),
      id,
    );
  }
  try {
    const [principal, params] = await Promise.all([requireAdminSession(request), context.params]);
    const apiKey = revokeAdminApiKey({
      userId: principal.userId,
      profileId: principal.profileId,
      keyId: params.keyId,
      requestId: id,
    });
    return withRequestId(NextResponse.json({ apiKey }), id);
  } catch (error) {
    const response = adminAuthError(error);
    if (response) return withRequestId(response, id);
    if (error instanceof Error) {
      return withRequestId(jsonError(404, 'api_key_not_found', error.message), id);
    }
    throw error;
  }
}
