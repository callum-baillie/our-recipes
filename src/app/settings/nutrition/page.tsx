import { cookies } from 'next/headers';
import Link from 'next/link';

import {
  NutritionProfileSettings,
  type NutritionProfileSettingsValue,
} from '@/components/nutrition-profile-settings';
import { ACTIVE_PROFILE_COOKIE, getActorContext } from '@/lib/actor-context';
import { nutritionLocalDateKey } from '@/lib/domain/nutrition-view';
import { listNutrientDefinitions } from '@/lib/services/nutrition-foundation-service';
import { resolveNutritionHouseholdContext } from '@/lib/services/nutrition-household-profile-service';
import { getPrivateNutritionProfile } from '@/lib/services/nutrition-profile-service';

export const dynamic = 'force-dynamic';

function storedList(value: string): string[] {
  try {
    const parsed = JSON.parse(value) as unknown;
    return Array.isArray(parsed)
      ? parsed.filter((item): item is string => typeof item === 'string')
      : [];
  } catch {
    return [];
  }
}

function settingsValue(
  profile: ReturnType<typeof getPrivateNutritionProfile>,
): NutritionProfileSettingsValue {
  return {
    id: profile.id,
    version: profile.version,
    dateOfBirth: profile.dateOfBirth,
    heightCentimeters: profile.heightCentimeters,
    currentWeightKilograms: profile.currentWeightKilograms,
    measurementSystem: profile.measurementSystem,
    referenceSexCategory: profile.referenceSexCategory,
    activityLevel: profile.activityLevel,
    nutritionGoalType: profile.nutritionGoalType,
    targetWeightKilograms: profile.targetWeightKilograms,
    targetDate: profile.targetDate,
    explicitlyEnteredLifeStage: profile.explicitlyEnteredLifeStage,
    dietaryPreferences: storedList(profile.dietaryPreferences),
    foodAllergies: storedList(profile.foodAllergies),
    dietaryExclusions: storedList(profile.dietaryExclusions),
    estimatedTargetsEnabled: profile.estimatedTargetsEnabled,
    estimatedTargetConsent: profile.estimatedTargetConsent,
    weightTrackingEnabled: profile.weightTrackingEnabled,
    preferredEnergyUnit: profile.preferredEnergyUnit,
    dailyResetTimezone: profile.dailyResetTimezone,
    weekStartsOn: profile.weekStartsOn,
    referenceJurisdiction: profile.referenceJurisdiction,
    visibleNutrientCodes: storedList(profile.visibleNutrientCodes),
    trendRangeDays: profile.trendRangeDays as 7 | 14 | 30,
    showPlannedNutrition: profile.showPlannedNutrition,
    showRecipeCardNutrition: profile.showRecipeCardNutrition,
    recipeCardNutrientCodes: storedList(profile.recipeCardNutrientCodes),
    showMealPlanNutrition: profile.showMealPlanNutrition,
  };
}

export default async function NutritionSettingsPage() {
  const actor = getActorContext((await cookies()).get(ACTIVE_PROFILE_COOKIE)?.value);
  const household = resolveNutritionHouseholdContext(actor);
  const profile = getPrivateNutritionProfile(
    household.activeNutritionProfile.id,
    household.compatibilityPrincipalId,
  );
  const definitions = listNutrientDefinitions().map((item) => ({
    code: item.code,
    displayName: item.displayName,
    category: item.category,
  }));

  return (
    <main className="recipe-page settings-hub">
      <section className="settings-intro settings-hub-intro">
        <Link className="quiet-link" href="/settings">
          ← Settings
        </Link>
        <p className="eyebrow">NUTRITION SETTINGS</p>
        <h1>{household.activeNutritionProfile.displayName}&apos;s Nutrition</h1>
        <p>
          These preferences follow the active household profile in the app header. Everyone in the
          household can still view shared Nutrition summaries.
        </p>
      </section>
      <NutritionProfileSettings
        profile={settingsValue(profile)}
        effectiveOn={nutritionLocalDateKey(new Date(), profile.dailyResetTimezone)}
        nutrientDefinitions={definitions}
      />
    </main>
  );
}
