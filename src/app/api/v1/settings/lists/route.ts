import { cookies } from 'next/headers';
import { NextResponse } from 'next/server';

import { ACTIVE_PROFILE_COOKIE, getActorContext } from '@/lib/actor-context';
import { listSettingsInputSchema } from '@/lib/domain/list-settings';
import { hasTrustedMutationOrigin, jsonError } from '@/lib/http';
import {
  getListSettingsWorkspace,
  ListSettingsConflictError,
  ListSettingsNotFoundError,
  updateListSettings,
} from '@/lib/services/list-settings-service';
import { switchAutomaticRestockTarget } from '@/lib/services/pantry-grocery-cooking-service';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

export function GET() {
  return NextResponse.json(getListSettingsWorkspace());
}

export async function PATCH(request: Request) {
  if (!hasTrustedMutationOrigin(request))
    return jsonError(403, 'untrusted_origin', 'This change must come from a trusted app origin.');
  const actor = getActorContext((await cookies()).get(ACTIVE_PROFILE_COOKIE)?.value);
  if (!actor.profileId)
    return jsonError(409, 'profile_selection_required', 'Choose a household profile first.');
  const parsed = listSettingsInputSchema.safeParse(await request.json().catch(() => null));
  if (!parsed.success) return jsonError(400, 'invalid_list_settings', 'Check the list settings.');
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
      return NextResponse.json(getListSettingsWorkspace());
    }
    return NextResponse.json(workspace);
  } catch (error) {
    if (error instanceof ListSettingsNotFoundError)
      return jsonError(404, 'supermarket_not_found', error.message);
    if (error instanceof ListSettingsConflictError)
      return jsonError(409, 'list_settings_conflict', error.message);
    throw error;
  }
}
