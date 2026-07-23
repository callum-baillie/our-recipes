import { NextResponse } from 'next/server';

import { pantryDemandQuerySchema } from '@/lib/domain/pantry-availability';
import { jsonError } from '@/lib/http';
import { getProjectedPantryDemand } from '@/lib/services/pantry-availability-service';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

export function GET(request: Request) {
  const parsed = pantryDemandQuerySchema.safeParse(
    Object.fromEntries(new URL(request.url).searchParams.entries()),
  );
  if (!parsed.success)
    return jsonError(400, 'invalid_pantry_demand_range', 'Use a valid Pantry demand date range.');
  return NextResponse.json({
    demand: getProjectedPantryDemand(parsed.data.weekStart, parsed.data.weekEnd),
  });
}
