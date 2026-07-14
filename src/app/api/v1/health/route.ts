import { NextResponse } from 'next/server';

import { getHouseholdState } from '@/lib/services/household-service';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

export function GET() {
  const state = getHouseholdState();
  return NextResponse.json({
    status: 'ok',
    version: 'v1',
    setupComplete: Boolean(state.household),
  });
}
