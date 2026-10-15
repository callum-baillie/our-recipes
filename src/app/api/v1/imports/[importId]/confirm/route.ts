import { withApiRequestId, authorizeCoreApi, actorFromPrincipal } from '@/lib/api-auth';

import { NextResponse } from 'next/server';

import { importConfirmationSchema } from '@/lib/domain/import';
import { jsonError } from '@/lib/http';
import {
  ImportNotFoundError,
  ImportStateError,
  confirmImportOperation,
} from '@/lib/services/import-service';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

export async function POST(request: Request, context: { params: Promise<{ importId: string }> }) {
  const access = await authorizeCoreApi(request);
  if (access.response) return access.response;

  const actor = actorFromPrincipal(access.principal);
  if (!actor.profileId) {
    return withApiRequestId(
      jsonError(
        409,
        'profile_selection_required',
        'Choose a household profile before adding this reviewed recipe.',
      ),
      access.requestId,
    );
  }
  const parsed = importConfirmationSchema.safeParse(await request.json().catch(() => null));
  if (!parsed.success)
    return withApiRequestId(
      jsonError(400, 'invalid_recipe', 'Check the reviewed recipe details.'),
      access.requestId,
    );
  try {
    const { importId } = await context.params;
    return withApiRequestId(
      NextResponse.json(confirmImportOperation(importId, parsed.data.recipe, actor.profileId), {
        status: 201,
      }),
      access.requestId,
    );
  } catch (error) {
    if (error instanceof ImportNotFoundError)
      return withApiRequestId(jsonError(404, 'import_not_found', error.message), access.requestId);
    if (error instanceof ImportStateError)
      return withApiRequestId(
        jsonError(409, 'import_already_confirmed', error.message),
        access.requestId,
      );
    throw error;
  }
}
