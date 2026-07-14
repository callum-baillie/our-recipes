import { NextResponse } from 'next/server';

import { isoDateSchema } from '@/lib/domain/planning';
import { jsonError } from '@/lib/http';
import { plannedMealsAsIcs } from '@/lib/services/planning-service';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

export async function GET(request: Request) {
  const params = new URL(request.url).searchParams;
  const weekStart = isoDateSchema.safeParse(params.get('start'));
  const weekEnd = isoDateSchema.safeParse(params.get('end'));
  if (!weekStart.success || !weekEnd.success)
    return jsonError(400, 'invalid_week', 'Use a valid week range.');
  return new NextResponse(plannedMealsAsIcs(weekStart.data, weekEnd.data), {
    headers: {
      'Cache-Control': 'no-store',
      'Content-Disposition': `attachment; filename="our-recipes-${weekStart.data}.ics"`,
      'Content-Type': 'text/calendar; charset=utf-8',
      'X-Content-Type-Options': 'nosniff',
    },
  });
}
