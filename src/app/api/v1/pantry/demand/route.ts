import { withApiRequestId, authorizeCoreApi } from '@/lib/api-auth';
import { NextResponse } from 'next/server';

import { pantryDemandQuerySchema } from '@/lib/domain/pantry-availability';
import { jsonError } from '@/lib/http';
import { getProjectedPantryDemand } from '@/lib/services/pantry-availability-service';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

export async function GET(request: Request) {
  const access = await authorizeCoreApi(request);
  if (access.response) return access.response;

  const parsed = pantryDemandQuerySchema.safeParse(
    Object.fromEntries(new URL(request.url).searchParams.entries()),
  );
  if (!parsed.success)
    return withApiRequestId(
      jsonError(400, 'invalid_pantry_demand_range', 'Use a valid Pantry demand date range.'),
      access.requestId,
    );
  return withApiRequestId(
    NextResponse.json({
      demand: getProjectedPantryDemand(parsed.data.weekStart, parsed.data.weekEnd),
    }),
    access.requestId,
  );
}
