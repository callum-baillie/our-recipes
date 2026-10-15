import { withApiRequestId, authorizeCoreApi, actorFromPrincipal } from '@/lib/api-auth';
import { NextResponse } from 'next/server';

import { pantryLocationInputSchema } from '@/lib/domain/pantry';
import { jsonError } from '@/lib/http';
import {
  createPantryLocation,
  ensureDefaultPantryLocations,
  listPantryLocations,
} from '@/lib/services/pantry-service';

import { pantryServiceError } from '../_shared';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

export async function GET(request: Request) {
  const access = await authorizeCoreApi(request);
  if (access.response) return access.response;

  const includeArchived = new URL(request.url).searchParams.get('includeArchived') === 'true';
  return withApiRequestId(
    NextResponse.json({ locations: listPantryLocations(includeArchived) }),
    access.requestId,
  );
}

export async function POST(request: Request) {
  const access = await authorizeCoreApi(request);
  if (access.response) return access.response;

  const actor = actorFromPrincipal(access.principal);

  const parsed = pantryLocationInputSchema.safeParse(await request.json().catch(() => null));
  if (!parsed.success)
    return withApiRequestId(
      jsonError(400, 'invalid_pantry_location', 'Check the location name and parent.'),
      access.requestId,
    );
  try {
    ensureDefaultPantryLocations(actor.profileId);
    return withApiRequestId(
      NextResponse.json(
        { location: createPantryLocation(parsed.data, actor.profileId) },
        { status: 201 },
      ),
      access.requestId,
    );
  } catch (error) {
    const response = pantryServiceError(error);
    if (response) return withApiRequestId(response, access.requestId);
    throw error;
  }
}
