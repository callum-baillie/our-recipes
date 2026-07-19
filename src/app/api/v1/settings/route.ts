import { NextResponse } from 'next/server';

import { householdSettingsSchema } from '@/lib/domain/setup';
import { hasTrustedMutationOrigin, jsonError } from '@/lib/http';
import { ConflictError, updateHouseholdSettings } from '@/lib/services/household-service';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

export async function PATCH(request: Request) {
  if (!hasTrustedMutationOrigin(request)) {
    return jsonError(403, 'untrusted_origin', 'This change must come from a trusted app origin.');
  }
  const parsed = householdSettingsSchema.safeParse(await request.json().catch(() => null));
  if (!parsed.success) {
    return jsonError(400, 'invalid_app_settings', 'Check the app and household names.');
  }
  try {
    return NextResponse.json({ household: updateHouseholdSettings(parsed.data) });
  } catch (error) {
    if (error instanceof ConflictError) return jsonError(409, 'setup_required', error.message);
    throw error;
  }
}
