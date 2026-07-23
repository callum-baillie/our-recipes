import { eq } from 'drizzle-orm';
import { randomUUID } from 'node:crypto';

import { ensureDatabase, getDatabase } from '@/lib/db/client';
import { nutritionPrincipals, nutritionProfiles, profiles } from '@/lib/db/schema';
import type { NutritionMutationActor } from '@/lib/domain/nutrition-household';
import { nutritionProfileInputSchema } from '@/lib/domain/nutrition-profile';
import { provisionLinkedNutritionProfile } from '@/lib/services/nutrition-profile-service';

type NutritionProfile = typeof nutritionProfiles.$inferSelect;
type Principal = Omit<typeof nutritionPrincipals.$inferSelect, 'credentialHash'>;

export type NutritionHouseholdFixtureIdentity = {
  principal: Principal;
  profile: NutritionProfile;
  actor: NutritionMutationActor;
};

export function createNutritionIdentity(
  retiredSecret: string,
  rawProfile: unknown,
): NutritionHouseholdFixtureIdentity {
  void retiredSecret;
  const input = nutritionProfileInputSchema.parse(rawProfile);
  ensureDatabase();
  const database = getDatabase();
  const householdProfileId = input.linkedHouseholdProfileId ?? randomUUID();
  const now = new Date();
  return database.transaction((transaction) => {
    let householdProfile = transaction
      .select()
      .from(profiles)
      .where(eq(profiles.id, householdProfileId))
      .get();
    if (!householdProfile) {
      transaction
        .insert(profiles)
        .values({
          id: householdProfileId,
          displayName: input.displayName,
          color: '#637A45',
          avatarUrl: input.avatarUrl || null,
          units: input.measurementSystem,
          temperatureUnit: input.measurementSystem === 'metric' ? 'C' : 'F',
          locale: 'en-US',
          timezone: input.dailyResetTimezone,
          archivedAt: null,
          createdAt: now,
          updatedAt: now,
        })
        .run();
      householdProfile = transaction
        .select()
        .from(profiles)
        .where(eq(profiles.id, householdProfileId))
        .get()!;
    }
    const provisioned = provisionLinkedNutritionProfile(householdProfile, transaction);
    transaction
      .update(nutritionProfiles)
      .set({
        displayName: input.displayName,
        avatarUrl: input.avatarUrl,
        profileType: input.profileType,
        dateOfBirth: input.dateOfBirth,
        heightCentimeters: input.heightCentimeters,
        currentWeightKilograms: input.currentWeightKilograms,
        measurementSystem: input.measurementSystem,
        referenceSexCategory: input.referenceSexCategory,
        activityLevel: input.activityLevel,
        nutritionGoalType: input.nutritionGoalType,
        targetWeightKilograms: input.targetWeightKilograms,
        targetDate: input.targetDate,
        explicitlyEnteredLifeStage: input.explicitlyEnteredLifeStage,
        dietaryPreferences: JSON.stringify(input.dietaryPreferences),
        foodAllergies: JSON.stringify(input.foodAllergies),
        dietaryExclusions: JSON.stringify(input.dietaryExclusions),
        estimatedTargetsEnabled: input.estimatedTargetsEnabled,
        estimatedTargetConsent: input.estimatedTargetConsent,
        weightTrackingEnabled: input.weightTrackingEnabled,
        comparisonVisibility: input.comparisonVisibility,
        diaryVisibility: input.diaryVisibility,
        preferredEnergyUnit: input.preferredEnergyUnit,
        dailyResetTimezone: input.dailyResetTimezone,
        weekStartsOn: input.weekStartsOn,
        referenceJurisdiction: input.referenceJurisdiction,
        visibleNutrientCodes: JSON.stringify(input.visibleNutrientCodes),
        trendRangeDays: input.trendRangeDays,
        showPlannedNutrition: input.showPlannedNutrition,
        showRecipeCardNutrition: input.showRecipeCardNutrition,
        recipeCardNutrientCodes: JSON.stringify(input.recipeCardNutrientCodes),
        showMealPlanNutrition: input.showMealPlanNutrition,
        updatedAt: now,
      })
      .where(eq(nutritionProfiles.id, provisioned.id))
      .run();
    const profile = transaction
      .select()
      .from(nutritionProfiles)
      .where(eq(nutritionProfiles.id, provisioned.id))
      .get()!;
    const storedPrincipal = transaction
      .select()
      .from(nutritionPrincipals)
      .where(eq(nutritionPrincipals.id, profile.ownerPrincipalId))
      .get()!;
    const principal: Principal = {
      id: storedPrincipal.id,
      accessVersion: storedPrincipal.accessVersion,
      archivedAt: storedPrincipal.archivedAt,
      lastAuthenticatedAt: storedPrincipal.lastAuthenticatedAt,
      createdAt: storedPrincipal.createdAt,
      updatedAt: storedPrincipal.updatedAt,
    };
    return {
      principal,
      profile,
      actor: {
        householdProfileId,
        compatibilityPrincipalId: principal.id,
      },
    };
  });
}

export function createNutritionPrincipal(retiredSecret: string): Principal {
  return createNutritionIdentity(retiredSecret, {
    displayName: 'Fixture household actor',
    comparisonVisibility: 'named',
  }).principal;
}
