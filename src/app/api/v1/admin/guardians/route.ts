import { NextResponse } from 'next/server';

import { guardianAssignmentSchema } from '@/lib/domain/permissions';
import { hasTrustedMutationOrigin, jsonError } from '@/lib/http';
import {
  getProfileAccessRole,
  RequestAuthError,
  requireAdminSession,
} from '@/lib/services/auth-service';
import {
  NutritionProfileConflictError,
  NutritionProfileForbiddenError,
  NutritionProfileNotFoundError,
  setHouseholdGuardianGrant,
} from '@/lib/services/nutrition-profile-service';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

export async function POST(request: Request) {
  if (!hasTrustedMutationOrigin(request)) {
    return jsonError(403, 'untrusted_origin', 'This change must come from a trusted app origin.');
  }
  try {
    await requireAdminSession(request);
    const parsed = guardianAssignmentSchema.safeParse(await request.json().catch(() => null));
    if (!parsed.success) {
      return jsonError(400, 'invalid_guardian_assignment', 'Choose a parent and child profile.');
    }
    const parentRole = getProfileAccessRole(parsed.data.parentProfileId);
    const childRole = getProfileAccessRole(parsed.data.childProfileId);
    if (parentRole !== 'parent' && parentRole !== 'admin') {
      return jsonError(409, 'guardian_role_required', 'A guardian must be a Parent or Admin.');
    }
    if (childRole !== 'child') {
      return jsonError(409, 'child_role_required', 'Guardian access can only target a Child.');
    }
    const grant = setHouseholdGuardianGrant({
      parentHouseholdProfileId: parsed.data.parentProfileId,
      childHouseholdProfileId: parsed.data.childProfileId,
      enabled: parsed.data.enabled,
    });
    return NextResponse.json({ grant });
  } catch (error) {
    if (error instanceof RequestAuthError) {
      return jsonError(error.status, error.code, error.message);
    }
    if (error instanceof NutritionProfileNotFoundError) {
      return jsonError(404, 'nutrition_profile_not_found', error.message);
    }
    if (
      error instanceof NutritionProfileConflictError ||
      error instanceof NutritionProfileForbiddenError
    ) {
      return jsonError(409, 'guardian_assignment_conflict', error.message);
    }
    throw error;
  }
}
