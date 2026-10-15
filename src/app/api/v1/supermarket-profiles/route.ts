import { withApiRequestId, authorizeCoreApi, actorFromPrincipal } from '@/lib/api-auth';

import { NextResponse } from 'next/server';

import { supermarketProfileInputSchema } from '@/lib/domain/list-settings';
import { jsonError } from '@/lib/http';
import {
  createSupermarketProfile,
  getListSettingsWorkspace,
  ListSettingsConflictError,
} from '@/lib/services/list-settings-service';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

export async function GET(request: Request) {
  const access = await authorizeCoreApi(request);
  if (access.response) return access.response;

  return withApiRequestId(NextResponse.json(getListSettingsWorkspace()), access.requestId);
}

export async function POST(request: Request) {
  const access = await authorizeCoreApi(request);
  if (access.response) return access.response;

  const actor = actorFromPrincipal(access.principal);
  if (!actor.profileId)
    return withApiRequestId(
      jsonError(409, 'profile_selection_required', 'Choose a household profile first.'),
      access.requestId,
    );
  const parsed = supermarketProfileInputSchema.safeParse(await request.json().catch(() => null));
  if (!parsed.success)
    return withApiRequestId(
      jsonError(400, 'invalid_supermarket_profile', 'Check the supermarket details.'),
      access.requestId,
    );
  try {
    return withApiRequestId(
      NextResponse.json(createSupermarketProfile(parsed.data, actor.profileId), {
        status: 201,
      }),
      access.requestId,
    );
  } catch (error) {
    if (error instanceof ListSettingsConflictError)
      return withApiRequestId(
        jsonError(409, 'supermarket_conflict', error.message),
        access.requestId,
      );
    throw error;
  }
}
