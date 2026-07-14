import { cookies } from 'next/headers';
import { NextResponse } from 'next/server';

import { ACTIVE_PROFILE_COOKIE, getActorContext } from '@/lib/actor-context';
import { restoreConfirmationSchema } from '@/lib/domain/backup';
import { hasTrustedMutationOrigin, jsonError } from '@/lib/http';
import {
  BackupError,
  BackupNotFoundError,
  BackupValidationError,
  restoreBackup,
} from '@/lib/services/backup-service';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

export async function POST(request: Request, context: { params: Promise<{ backupId: string }> }) {
  if (!hasTrustedMutationOrigin(request)) {
    return jsonError(403, 'untrusted_origin', 'This change must come from a trusted app origin.');
  }
  const actor = getActorContext((await cookies()).get(ACTIVE_PROFILE_COOKIE)?.value);
  if (!actor.profileId) {
    return jsonError(
      409,
      'profile_selection_required',
      'Choose a household profile before restoring data.',
    );
  }
  const parsed = restoreConfirmationSchema.safeParse(await request.json().catch(() => null));
  if (!parsed.success) {
    return jsonError(
      400,
      'restore_confirmation_required',
      'Type RESTORE before replacing household data.',
    );
  }
  try {
    const result = await restoreBackup((await context.params).backupId);
    return NextResponse.json({ restored: true, safetyBackup: result.safetyBackup });
  } catch (error) {
    if (error instanceof BackupNotFoundError)
      return jsonError(404, 'backup_not_found', error.message);
    if (error instanceof BackupValidationError)
      return jsonError(422, 'backup_invalid', error.message);
    if (error instanceof BackupError)
      return jsonError(409, 'backup_restore_refused', error.message);
    throw error;
  }
}
