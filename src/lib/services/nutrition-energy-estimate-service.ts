import 'server-only';

import { eq } from 'drizzle-orm';

import { ensureDatabase, getDatabase } from '@/lib/db/client';
import { nutritionGoalVersions } from '@/lib/db/schema';
import {
  estimateAdultEnergy,
  NASEM_EER_SOURCE_ID,
  nutritionEnergyEstimateRequestSchema,
  NutritionEnergyEstimateUnavailableError,
  type NutritionEnergyEstimateRequest,
} from '@/lib/domain/nutrition-energy-estimate';
import { latestNutritionSeries } from '@/lib/domain/nutrition-view';
import type { NutritionMutationActorInput } from '@/lib/domain/nutrition-household';
import {
  NutritionProfileConflictError,
  appendNutritionGoalVersion,
  getPrivateNutritionProfile,
  listNutritionGoalVersions,
} from '@/lib/services/nutrition-profile-service';

function db() {
  ensureDatabase();
  return getDatabase();
}

function currentEnergyGoals(profileId: string, requesterPrincipalId: string, effectiveOn: string) {
  return latestNutritionSeries(listNutritionGoalVersions(profileId, requesterPrincipalId)).filter(
    (goal) =>
      goal.nutrientCode === 'energy_kcal' &&
      goal.state === 'active' &&
      goal.startsOn <= effectiveOn &&
      (!goal.endsOn || goal.endsOn >= effectiveOn),
  );
}

function noteFor(estimate: ReturnType<typeof estimateAdultEnergy>, expectedProfileVersion: number) {
  return JSON.stringify({
    method: NASEM_EER_SOURCE_ID,
    doi: estimate.doi,
    profileVersion: expectedProfileVersion,
    effectiveOn: estimate.effectiveOn,
    sexCategory: estimate.referenceSexCategory,
    pal: estimate.palCategory,
    ageYears: estimate.ageYears,
    heightCm: estimate.heightCentimeters,
    weightKg: estimate.currentWeightKilograms,
    exactKcal: Number(estimate.exactKcal.toFixed(4)),
    roundedKcal: estimate.roundedKcal,
    rounding: 'nearest_whole_kcal',
  });
}

function sameOperation(
  existing: typeof nutritionGoalVersions.$inferSelect,
  input: Extract<NutritionEnergyEstimateRequest, { action: 'apply' }>,
) {
  try {
    const note = JSON.parse(existing.note) as Record<string, unknown>;
    return (
      existing.sourceReferenceId === NASEM_EER_SOURCE_ID &&
      existing.nutrientCode === 'energy_kcal' &&
      existing.unit === 'kcal' &&
      existing.sourceType === 'reference' &&
      existing.kind === 'target' &&
      existing.value === note.roundedKcal &&
      existing.startsOn === input.effectiveOn &&
      existing.supersedesGoalVersionId === input.supersedesGoalVersionId &&
      note.profileVersion === input.expectedProfileVersion &&
      note.effectiveOn === input.effectiveOn &&
      note.pal === input.palCategory
    );
  } catch {
    return false;
  }
}

export function previewOrApplyNutritionEnergyEstimate(
  profileId: string,
  actor: NutritionMutationActorInput,
  raw: NutritionEnergyEstimateRequest,
) {
  const input = nutritionEnergyEstimateRequestSchema.parse(raw);
  const requesterPrincipalId = typeof actor === 'string' ? actor : actor.compatibilityPrincipalId;
  const profile = getPrivateNutritionProfile(profileId, requesterPrincipalId);
  if (input.action === 'apply') {
    const existing = db()
      .select()
      .from(nutritionGoalVersions)
      .where(eq(nutritionGoalVersions.id, input.operationId))
      .get();
    if (existing) {
      if (
        existing.nutritionProfileId !== profileId ||
        existing.createdByPrincipalId !== requesterPrincipalId ||
        !sameOperation(existing, input)
      )
        throw new NutritionProfileConflictError(
          'This estimate operation ID was already used with different evidence.',
        );
      return { action: 'applied' as const, estimate: null, currentEnergyGoals: [], goal: existing };
    }
  }
  if (profile.version !== input.expectedProfileVersion)
    throw new NutritionProfileConflictError(
      'Nutrition profile inputs changed. Refresh the estimate.',
    );
  // This second authorization is intentional: managing body inputs does not imply managing goals.
  const goals = currentEnergyGoals(profileId, requesterPrincipalId, input.effectiveOn);
  if (!profile.estimatedTargetsEnabled || !profile.estimatedTargetConsent)
    throw new NutritionEnergyEstimateUnavailableError(
      'Enable estimated targets and explicitly consent before requesting an estimate.',
    );
  if (profile.explicitlyEnteredLifeStage !== null)
    throw new NutritionEnergyEstimateUnavailableError(
      'Pregnancy and breastfeeding estimates require additional reviewed inputs and are not supported yet.',
    );
  if (
    !profile.dateOfBirth ||
    profile.heightCentimeters === null ||
    profile.currentWeightKilograms === null ||
    profile.referenceSexCategory === null
  )
    throw new NutritionEnergyEstimateUnavailableError(
      'Date of birth, height, current weight and the reference source sex category are required.',
    );
  const estimate = estimateAdultEnergy({
    dateOfBirth: profile.dateOfBirth,
    effectiveOn: input.effectiveOn,
    heightCentimeters: profile.heightCentimeters,
    currentWeightKilograms: profile.currentWeightKilograms,
    referenceSexCategory: profile.referenceSexCategory,
    palCategory: input.palCategory,
  });
  const visibleGoals = goals.map((goal) => ({
    id: goal.id,
    revision: goal.revision,
    sourceType: goal.sourceType,
    value: goal.value,
    unit: goal.unit,
  }));
  if (input.action === 'preview')
    return { action: 'previewed' as const, estimate, currentEnergyGoals: visibleGoals, goal: null };
  if (goals.length > 0) {
    const selected = goals.find((goal) => goal.id === input.supersedesGoalVersionId);
    if (!selected)
      throw new NutritionProfileConflictError(
        'Select the exact current calorie-goal version to supersede before applying this estimate.',
      );
  } else if (input.supersedesGoalVersionId !== null) {
    throw new NutritionProfileConflictError('There is no current calorie goal to supersede.');
  }
  const goal = appendNutritionGoalVersion(
    profileId,
    actor,
    {
      id: input.operationId,
      nutrientCode: 'energy_kcal',
      unit: 'kcal',
      sourceType: 'reference',
      sourceReferenceId: NASEM_EER_SOURCE_ID,
      startsOn: input.effectiveOn,
      endsOn: null,
      state: 'active',
      kind: 'target',
      value: estimate.roundedKcal,
      note: noteFor(estimate, input.expectedProfileVersion),
    },
    { supersedesGoalVersionId: input.supersedesGoalVersionId },
  );
  return { action: 'applied' as const, estimate, currentEnergyGoals: visibleGoals, goal };
}
