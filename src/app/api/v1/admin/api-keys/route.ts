import { NextResponse } from 'next/server';

import { createApiKeySchema } from '@/lib/domain/auth';
import { hasTrustedMutationOrigin, jsonError } from '@/lib/http';
import { createAdminApiKey, listAdminApiKeys } from '@/lib/services/api-key-service';
import { requireAdminSession } from '@/lib/services/auth-service';
import { adminAuthError, requestId, withRequestId } from '@/app/api/v1/admin/api-keys/_shared';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

export async function GET(request: Request) {
  const id = requestId(request);
  try {
    const principal = await requireAdminSession(request, { fresh: false });
    return withRequestId(NextResponse.json({ apiKeys: listAdminApiKeys(principal.userId) }), id);
  } catch (error) {
    const response = adminAuthError(error);
    if (response) return withRequestId(response, id);
    throw error;
  }
}

export async function POST(request: Request) {
  const id = requestId(request);
  if (!hasTrustedMutationOrigin(request)) {
    return withRequestId(
      jsonError(403, 'untrusted_origin', 'This change must come from a trusted app origin.'),
      id,
    );
  }
  const parsed = createApiKeySchema.safeParse(await request.json().catch(() => null));
  if (!parsed.success) {
    return withRequestId(
      jsonError(
        400,
        'invalid_api_key',
        parsed.error.issues[0]?.message ?? 'Check the API key details.',
      ),
      id,
    );
  }
  try {
    const principal = await requireAdminSession(request);
    const created = await createAdminApiKey({
      userId: principal.userId,
      profileId: principal.profileId,
      ...parsed.data,
      requestId: id,
    });
    return withRequestId(NextResponse.json(created, { status: 201 }), id);
  } catch (error) {
    const response = adminAuthError(error);
    if (response) return withRequestId(response, id);
    throw error;
  }
}
