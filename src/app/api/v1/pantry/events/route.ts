import { withApiRequestId, authorizeCoreApi } from '@/lib/api-auth';
import { NextResponse } from 'next/server';

import { pantryEventQuerySchema } from '@/lib/domain/pantry';
import { jsonError } from '@/lib/http';
import { listPantryEvents } from '@/lib/services/pantry-service';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

export async function GET(request: Request) {
  const access = await authorizeCoreApi(request);
  if (access.response) return access.response;

  const parsed = pantryEventQuerySchema.safeParse(
    Object.fromEntries(new URL(request.url).searchParams.entries()),
  );
  if (!parsed.success)
    return withApiRequestId(
      jsonError(400, 'invalid_pantry_event_query', 'Use a valid batch and event limit.'),
      access.requestId,
    );
  return withApiRequestId(
    NextResponse.json({ events: listPantryEvents(parsed.data.batchId, parsed.data.limit) }),
    access.requestId,
  );
}
