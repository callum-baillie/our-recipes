import { headers } from 'next/headers';
import { redirect } from 'next/navigation';
import Link from 'next/link';
import { getAuthenticatedSessionPrincipal } from '@/lib/services/auth-service';

import {
  NutritionProfileSettings,
  type NutritionProfileSettingsValue,
} from '@/components/nutrition-profile-settings';
import { SettingsPageHeader } from '@/components/settings-page-header';
import { validTimeZone } from '@/lib/domain/regional';
import { nutritionLocalDateKey } from '@/lib/domain/nutrition-view';
import { listNutrientDefinitions } from '@/lib/services/nutrition-foundation-service';
import { resolveNutritionHouseholdContext } from '@/lib/services/nutrition-household-profile-service';
import {
  getPrivateNutritionProfile,
  listAccessibleNutritionProfiles,
} from '@/lib/services/nutrition-profile-service';

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
  const session = await getAuthenticatedSessionPrincipal(
    new Request('http://localhost/account/nutrition', { headers: await headers() }),
  );
  if (!session) redirect('/sign-in');
  const household = resolveNutritionHouseholdContext({
    profileId: session.linkedProfileId,
    source: 'auth-session',
  });
  const selected = listAccessibleNutritionProfiles(household.compatibilityPrincipalId).find(
    (profile) => profile.linkedHouseholdProfileId === session.profileId,
  );
  if (
    !selected?.canManageProfile ||
    (session.accountRole === 'child' && session.profileId !== session.linkedProfileId)
  )
    return (
      <main className="recipe-page settings-hub">
        <SettingsPageHeader
          eyebrow="NUTRITION SETTINGS"
          title="Nutrition preferences are read only"
          description="Your signed-in account cannot change this person’s preferences. Switch to your own profile or a child you have permission to manage."
        />
        <Link href="/nutrition">Return to Nutrition</Link>
      </main>
    );
  const profile = getPrivateNutritionProfile(selected.id, household.compatibilityPrincipalId);
  const definitions = listNutrientDefinitions().map((item) => ({
    code: item.code,
    displayName: item.displayName,
    category: item.category,
    canonicalUnit: item.canonicalUnit,
  }));

  return (
    <main className="recipe-page settings-hub">
      <SettingsPageHeader
        eyebrow="NUTRITION SETTINGS"
        title={`${selected.displayName}'s Nutrition`}
        description={
          <>
            These preferences follow the active household Nutrition profile. Access to another
            person’s data follows your account role and guardian permissions.
          </>
        }
      />
      <NutritionProfileSettings
        key={profile.id}
        personName={selected.displayName}
        profile={settingsValue(profile)}
        effectiveOn={nutritionLocalDateKey(
          new Date(),
          validTimeZone(profile.dailyResetTimezone) ? profile.dailyResetTimezone : 'UTC',
        )}
        nutrientDefinitions={definitions}
      />
    </main>
  );
}
