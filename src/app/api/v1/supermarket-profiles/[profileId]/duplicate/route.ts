import { withApiRequestId, authorizeCoreApi, actorFromPrincipal } from '@/lib/api-auth';

import { NextResponse } from 'next/server';

import { jsonError } from '@/lib/http';
import {
  duplicateSupermarketProfile,
  ListSettingsConflictError,
  ListSettingsNotFoundError,
} from '@/lib/services/list-settings-service';

export const runtime = 'nodejs';

export async function POST(request: Request, context: { params: Promise<{ profileId: string }> }) {
  const access = await authorizeCoreApi(request);
  if (access.response) return access.response;

  const actor = actorFromPrincipal(access.principal);
  if (!actor.profileId)
    return withApiRequestId(
      jsonError(409, 'profile_selection_required', 'Choose a household profile first.'),
      access.requestId,
    );
  try {
    return withApiRequestId(
      NextResponse.json(
        duplicateSupermarketProfile((await context.params).profileId, actor.profileId),
        { status: 201 },
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
