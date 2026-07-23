import { NextResponse } from 'next/server';

import { pantryQuerySchema } from '@/lib/domain/pantry';
import { getPantryDashboard } from '@/lib/services/pantry-service';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

export function GET(request: Request) {
  const parsed = pantryQuerySchema.safeParse(
    Object.fromEntries(new URL(request.url).searchParams.entries()),
  );
  if (!parsed.success)
    return NextResponse.json(
      { error: { code: 'invalid_pantry_query', message: 'Use valid Pantry filters.' } },
      { status: 400 },
    );
  return NextResponse.json({ dashboard: getPantryDashboard(parsed.data) });
}
