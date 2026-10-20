import { NextResponse } from 'next/server';

import { getHouseholdState } from '@/lib/services/household-service';
import { APPLICATION_VERSION, SCHEMA_VERSION, getReleaseStatus } from '@/lib/release';
import { BackupRecoveryRequiredError } from '@/lib/domain/backup-recovery';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

export function GET() {
  try {
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
  } catch (error) {
    if (error instanceof BackupRecoveryRequiredError)
      return NextResponse.json(
        {
          status: 'recovery_required',
          version: APPLICATION_VERSION,
          schemaVersion: SCHEMA_VERSION,
          migrationStatus: 'blocked',
          setupComplete: null,
        },
        { status: 503 },
      );
    throw error;
  }
}
