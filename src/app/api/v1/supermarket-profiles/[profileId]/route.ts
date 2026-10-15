import { withApiRequestId, authorizeCoreApi, actorFromPrincipal } from '@/lib/api-auth';

import { NextResponse } from 'next/server';

import { supermarketProfileUpdateSchema } from '@/lib/domain/list-settings';
import { jsonError } from '@/lib/http';
import {
  ListSettingsConflictError,
  ListSettingsNotFoundError,
  updateSupermarketProfile,
} from '@/lib/services/list-settings-service';

export const runtime = 'nodejs';

export async function PATCH(request: Request, context: { params: Promise<{ profileId: string }> }) {
  const access = await authorizeCoreApi(request);
  if (access.response) return access.response;

  const actor = actorFromPrincipal(access.principal);
  if (!actor.profileId)
    return withApiRequestId(
      jsonError(409, 'profile_selection_required', 'Choose a household profile first.'),
      access.requestId,
    );
  const parsed = supermarketProfileUpdateSchema.safeParse(await request.json().catch(() => null));
  if (!parsed.success)
    return withApiRequestId(
      jsonError(400, 'invalid_supermarket_profile', 'Check the supermarket details.'),
      access.requestId,
    );
  try {
    return withApiRequestId(
      NextResponse.json(
        updateSupermarketProfile((await context.params).profileId, parsed.data, actor.profileId),
      ),
      access.requestId,
    );
  } catch (error) {
    if (error instanceof ListSettingsNotFoundError)
      return withApiRequestId(
        jsonError(404, 'supermarket_not_found', error.message),
        access.requestId,
      );
    if (error instanceof ListSettingsConflictError)
      return withApiRequestId(
        jsonError(409, 'supermarket_conflict', error.message),
        access.requestId,
      );
    throw error;
  }
}
