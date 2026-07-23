import { cookies } from 'next/headers';
import { NextResponse } from 'next/server';
import { z, ZodError } from 'zod';

import { ACTIVE_PROFILE_COOKIE, getActorContext } from '@/lib/actor-context';
import { hasTrustedMutationOrigin, jsonError } from '@/lib/http';
import {
  NutritionDiaryLifecycleConflictError,
  NutritionDiaryLifecycleForbiddenError,
  NutritionDiaryLifecycleIntegrityError,
  NutritionDiaryLifecycleNotFoundError,
} from '@/lib/services/nutrition-diary-lifecycle-service';
import {
  NutritionPreparedConflictError,
  NutritionPreparedForbiddenError,
  NutritionPreparedIntegrityError,
  NutritionPreparedNotFoundError,
} from '@/lib/services/nutrition-prepared-consumption-service';
import {
  NutritionFoundationConflictError,
  NutritionFoundationIntegrityError,
  NutritionFoundationNotFoundError,
} from '@/lib/services/nutrition-foundation-service';
import {
  NutritionIntakeConflictError,
  NutritionIntakeForbiddenError,
  NutritionIntakeIntegrityError,
  NutritionIntakeNotFoundError,
} from '@/lib/services/nutrition-intake-service';
import {
  NutritionRecipeConflictError,
  NutritionRecipeIntegrityError,
  NutritionRecipeNotFoundError,
} from '@/lib/services/nutrition-recipe-calculation-service';
import {
  NutritionProfileConflictError,
  NutritionProfileForbiddenError,
  NutritionProfileNotFoundError,
} from '@/lib/services/nutrition-profile-service';
import {
  NutritionRecommendationConflictError,
  NutritionRecommendationNotFoundError,
} from '@/lib/services/nutrition-recommendation-service';
import { NutritionEnergyEstimateUnavailableError } from '@/lib/domain/nutrition-energy-estimate';
import {
  NutritionHouseholdActorRequiredError,
  NutritionHouseholdLinkConflictError,
  resolveNutritionHouseholdContext,
} from '@/lib/services/nutrition-household-profile-service';

export const nutritionProfileIdSchema = z.string().uuid();
export const nutritionAccessSecretSchema = z
  .string()
  .min(8)
  .superRefine((value, context) => {
    if (Buffer.byteLength(value, 'utf8') > 256) {
      context.addIssue({
        code: 'custom',
        message: 'Nutrition access secret must be no more than 256 UTF-8 bytes.',
      });
    }
  });

export function parseNutritionProfileId(value: string): string {
  return nutritionProfileIdSchema.parse(value);
}

export function rejectUntrustedNutritionMutation(request: Request): NextResponse | null {
  return hasTrustedMutationOrigin(request)
    ? null
    : jsonError(403, 'untrusted_origin', 'This change must come from a trusted app origin.');
}

export async function requireNutritionPrincipal() {
  try {
    const actor = getActorContext((await cookies()).get(ACTIVE_PROFILE_COOKIE)?.value);
    const household = resolveNutritionHouseholdContext(actor);
    return {
      actor: {
        householdProfileId: household.actor.profileId,
        compatibilityPrincipalId: household.compatibilityPrincipalId,
      },
      principal: {
        id: household.compatibilityPrincipalId,
        householdProfileId: household.actor.profileId,
        nutritionProfileId: household.activeNutritionProfile.id,
      },
      household,
      response: null,
    };
  } catch (error) {
    return {
      actor: null,
      principal: null,
      household: null,
      response: nutritionApiError(error),
    };
  }
}

export function attachNutritionSession(response: NextResponse, value: string): NextResponse {
  void value;
  return response;
}

export function clearNutritionSession(response: NextResponse): NextResponse {
  return response;
}

export function nutritionApiError(error: unknown): NextResponse {
  if (error instanceof ZodError) {
    return NextResponse.json(
      {
        error: {
          code: 'invalid_nutrition_input',
          message: 'Nutrition input is invalid.',
          issues: error.issues,
        },
      },
      { status: 400 },
    );
  }
  if (error instanceof NutritionEnergyEstimateUnavailableError) {
    return jsonError(400, 'nutrition_estimate_unavailable', error.message);
  }
  if (error instanceof NutritionHouseholdActorRequiredError) {
    return jsonError(409, 'nutrition_profile_required', error.message);
  }
  if (error instanceof NutritionHouseholdLinkConflictError) {
    return jsonError(409, 'nutrition_link_conflict', error.message);
  }
  if (
    error instanceof NutritionProfileNotFoundError ||
    error instanceof NutritionIntakeNotFoundError ||
    error instanceof NutritionFoundationNotFoundError ||
    error instanceof NutritionRecipeNotFoundError ||
    error instanceof NutritionPreparedNotFoundError ||
    error instanceof NutritionDiaryLifecycleNotFoundError ||
    error instanceof NutritionRecommendationNotFoundError
  ) {
    return jsonError(404, 'nutrition_not_found', error.message);
  }
  if (
    error instanceof NutritionProfileForbiddenError ||
    error instanceof NutritionIntakeForbiddenError ||
    error instanceof NutritionPreparedForbiddenError ||
    error instanceof NutritionDiaryLifecycleForbiddenError
  ) {
    return jsonError(403, 'nutrition_forbidden', error.message);
  }
  if (
    error instanceof NutritionProfileConflictError ||
    error instanceof NutritionIntakeConflictError ||
    error instanceof NutritionFoundationConflictError ||
    error instanceof NutritionRecipeConflictError ||
    error instanceof NutritionPreparedConflictError ||
    error instanceof NutritionDiaryLifecycleConflictError ||
    error instanceof NutritionRecommendationConflictError
  ) {
    return jsonError(409, 'nutrition_conflict', error.message);
  }
  if (
    error instanceof NutritionIntakeIntegrityError ||
    error instanceof NutritionFoundationIntegrityError ||
    error instanceof NutritionRecipeIntegrityError ||
    error instanceof NutritionPreparedIntegrityError ||
    error instanceof NutritionDiaryLifecycleIntegrityError
  ) {
    return jsonError(400, 'invalid_nutrition_change', error.message);
  }
  return jsonError(500, 'nutrition_error', 'Nutrition could not complete this request.');
}

export async function readJson(request: Request): Promise<unknown> {
  try {
    return await request.json();
  } catch {
    throw new ZodError([
      { code: 'custom', path: [], message: 'Request body must contain valid JSON.' },
    ]);
  }
}
