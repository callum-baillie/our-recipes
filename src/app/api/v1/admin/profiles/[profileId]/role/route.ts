import { NextResponse } from 'next/server';

import { roleSelectionSchema } from '@/lib/domain/permissions';
import { hasTrustedMutationOrigin, jsonError } from '@/lib/http';
import {
  adminAuthError,
  requestId,
  withRequestId,
} from '@/app/api/v1/admin/api-keys/_shared';
import {
  AuthorizationConflictError,
  changeProfileAccessRole,
  requireAdminSession,
} from '@/lib/services/auth-service';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

export async function PATCH(
  request: Request,
  context: { params: Promise<{ profileId: string }> },
) {
  const id = requestId(request);
  if (!hasTrustedMutationOrigin(request)) {
    return withRequestId(
      jsonError(403, 'untrusted_origin', 'This change must come from a trusted app origin.'),
      id,
    );
  }
  try {
    const principal = await requireAdminSession(request);
    const parsed = roleSelectionSchema.safeParse(await request.json().catch(() => null));
    if (!parsed.success) {
      return withRequestId(
        jsonError(400, 'invalid_profile_role', 'Choose Admin, Parent, or Child.'),
        id,
      );
    }
    const { profileId } = await context.params;
    return withRequestId(
      NextResponse.json({
        account: changeProfileAccessRole({
          profileId,
          role: parsed.data.role,
          actorUserId: principal.userId,
        }),
      }),
      id,
    );
  } catch (error) {
    const authError = adminAuthError(error);
    if (authError) return withRequestId(authError, id);
    if (error instanceof AuthorizationConflictError) {
      return withRequestId(jsonError(409, error.code, error.message), id);
    }
    throw error;
  }
}
