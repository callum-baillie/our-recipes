import { withApiRequestId, authorizeCoreApi, actorFromPrincipal } from '@/lib/api-auth';

import { NextResponse } from 'next/server';

import { listSettingsInputSchema } from '@/lib/domain/list-settings';
import { jsonError } from '@/lib/http';
import {
  getListSettingsWorkspace,
  ListSettingsConflictError,
  ListSettingsNotFoundError,
  updateListSettings,
} from '@/lib/services/list-settings-service';
import { switchAutomaticRestockTarget } from '@/lib/services/pantry-grocery-cooking-service';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

export async function GET(request: Request) {
  const access = await authorizeCoreApi(request);
  if (access.response) return access.response;

  return withApiRequestId(NextResponse.json(getListSettingsWorkspace()), access.requestId);
}

export async function PATCH(request: Request) {
  const access = await authorizeCoreApi(request);
  if (access.response) return access.response;

  const actor = actorFromPrincipal(access.principal);
  if (!actor.profileId)
    return withApiRequestId(
      jsonError(409, 'profile_selection_required', 'Choose a household profile first.'),
      access.requestId,
    );
  const parsed = listSettingsInputSchema.safeParse(await request.json().catch(() => null));
  if (!parsed.success)
    return withApiRequestId(
      jsonError(400, 'invalid_list_settings', 'Check the list settings.'),
      access.requestId,
    );
  try {
    const previousTarget = getListSettingsWorkspace().settings.automaticRestockListId;
    const workspace = updateListSettings(
      { ...parsed.data, automaticRestockListId: undefined },
      actor.profileId,
    );
    if (
      parsed.data.automaticRestockListId !== undefined &&
      (parsed.data.automaticRestockListId || null) !== previousTarget
    ) {
      switchAutomaticRestockTarget(parsed.data.automaticRestockListId || null, actor.profileId);
      return withApiRequestId(NextResponse.json(getListSettingsWorkspace()), access.requestId);
    }
    return withApiRequestId(NextResponse.json(workspace), access.requestId);
  } catch (error) {
    if (error instanceof ListSettingsNotFoundError)
      return withApiRequestId(
        jsonError(404, 'supermarket_not_found', error.message),
        access.requestId,
      );
    if (error instanceof ListSettingsConflictError)
      return withApiRequestId(
        jsonError(409, 'list_settings_conflict', error.message),
        access.requestId,
      );
    throw error;
  }
}
