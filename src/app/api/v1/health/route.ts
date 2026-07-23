import { NextResponse } from 'next/server';

import { getHouseholdState } from '@/lib/services/household-service';
import { getReleaseStatus } from '@/lib/release';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

export function GET() {
  const state = getHouseholdState();
  const release = getReleaseStatus();
  return NextResponse.json(
    {
      status:
        release.migrationStatus === 'current' && release.databaseIntegrity === 'ok'
          ? 'ok'
          : 'error',
      version: release.applicationVersion,
      schemaVersion: release.schemaVersion,
      migrationStatus: release.migrationStatus,
      setupComplete: Boolean(state.household),
    },
    { status: release.migrationStatus === 'current' ? 200 : 503 },
  );
}
