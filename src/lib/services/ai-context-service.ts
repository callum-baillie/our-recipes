import 'server-only';

import { createHmac } from 'node:crypto';

import { getRuntimeConfig } from '@/lib/config';
import { addLocalDateDays, localIsoDate } from '@/lib/domain/local-date';
import { summarizeNutritionDiary } from '@/lib/domain/nutrition-view';
import { hasProfileGoalContext } from '@/lib/domain/profile-goals';
import { getAiDataPolicy } from '@/lib/services/ai-settings-service';
import { getProfile } from '@/lib/services/household-service';
import { listNutritionIntakeRevisions } from '@/lib/services/nutrition-intake-service';
import { resolveNutritionHouseholdContext } from '@/lib/services/nutrition-household-profile-service';
import { listNutritionGoalVersions } from '@/lib/services/nutrition-profile-service';
import { listPlannedMeals } from '@/lib/services/planning-service';
import { listRecipes } from '@/lib/services/recipe-service';

export function aiSafetyIdentifier(profileId: string): string {
  return createHmac('sha256', getRuntimeConfig().cookieSecret)
    .update(`openai-safety:${profileId}`)
    .digest('base64url')
    .slice(0, 64);
}

export function buildAiProfileContext(actorProfileId: string) {
  const household = resolveNutritionHouseholdContext({
    profileId: actorProfileId,
    source: 'profile-cookie',
  });
  return household.householdNutritionProfiles.map((profile) => {
    const policy = getAiDataPolicy(profile.linkedHouseholdProfileId ?? profile.id);
    const householdProfile = profile.linkedHouseholdProfileId
      ? getProfile(profile.linkedHouseholdProfileId)
      : null;
    const active = profile.id === household.activeNutritionProfile.id;
    const context: Record<string, unknown> = {
      key: profile.linkedHouseholdProfileId ?? profile.id,
      active,
      measurementSystem: profile.measurementSystem,
      preferredEnergyUnit: profile.preferredEnergyUnit,
      dailyResetTimezone: profile.dailyResetTimezone,
      weekStartsOn: profile.weekStartsOn,
    };
    if (policy.shareIdentity) context.displayName = profile.displayName;
    if (
      policy.shareProfileGoals &&
      householdProfile &&
      hasProfileGoalContext(householdProfile.goalContext, householdProfile.mainGoals)
    ) {
      context.profileGoals = {
        focusAreas: householdProfile.goalContext.focusAreas,
        motivation: householdProfile.goalContext.motivation,
        challenges: householdProfile.goalContext.challenges,
        successVision: householdProfile.goalContext.successVision,
        additionalNotes: householdProfile.mainGoals,
      };
    }
    if (policy.shareDietaryPreferences) {
      context.dietaryPreferences = JSON.parse(profile.dietaryPreferences);
      context.foodAllergies = JSON.parse(profile.foodAllergies);
      context.dietaryExclusions = JSON.parse(profile.dietaryExclusions);
    }
    if (policy.sharePersonalMetrics) {
      context.activityLevel = profile.activityLevel;
      context.heightCentimeters = profile.heightCentimeters;
      context.referenceSexCategory = profile.referenceSexCategory;
      context.explicitlyEnteredLifeStage = profile.explicitlyEnteredLifeStage;
    }
    if (policy.shareWeight) {
      context.currentWeightKilograms = profile.currentWeightKilograms;
      context.targetWeightKilograms = profile.targetWeightKilograms;
    }
    if (policy.shareNutritionGoals) {
      try {
        context.nutritionGoals = listNutritionGoalVersions(
          profile.id,
          household.compatibilityPrincipalId,
        ).map((goal) => ({
          nutrientCode: goal.nutrientCode,
          kind: goal.kind,
          value: goal.value,
          minimum: goal.minimum,
          maximum: goal.maximum,
          unit: goal.unit,
          state: goal.state,
        }));
      } catch {
        context.nutritionGoalsUnavailable = true;
      }
    }
    if (policy.shareNutritionAggregates || policy.shareRawDiary) {
      try {
        const revisions = listNutritionIntakeRevisions(
          profile.id,
          household.compatibilityPrincipalId,
        );
        const summary = summarizeNutritionDiary(revisions, {
          timeZone: profile.dailyResetTimezone,
          days: 7,
        });
        if (policy.shareNutritionAggregates) {
          context.nutrition = {
            todayTotals: summary.todayTotals,
            sevenDayTotals: summary.sevenDayTotals,
            trend: summary.trend,
            averageCompleteness: summary.averageCompleteness,
            averageConfidence: summary.averageConfidence,
            hasEstimatedValues: summary.hasEstimatedValues,
          };
        }
        if (policy.shareRawDiary) {
          context.diary = summary.currentEntries.slice(0, 30).map((entry) => ({
            occurredAt: entry.occurredAt,
            mealSlot: entry.mealSlot,
            sourceName: entry.sourceNameSnapshot,
            values: entry.values,
          }));
        }
      } catch {
        context.nutritionDataUnavailable = true;
      }
    }
    return context;
  });
}

export function buildAiSharedContext(
  actorProfileId: string,
  range?: { start: string; end: string },
) {
  const policy = getAiDataPolicy(actorProfileId);
  const household = resolveNutritionHouseholdContext({
    profileId: actorProfileId,
    source: 'profile-cookie',
  });
  const today = localIsoDate(new Date(), household.activeNutritionProfile.dailyResetTimezone);
  const resolvedRange = range ?? { start: today, end: addLocalDateDays(today, 13) };
  return {
    profiles: buildAiProfileContext(actorProfileId),
    recipes: policy.shareSharedRecipes
      ? listRecipes('')
          .slice(0, 100)
          .map((recipe) => ({
            id: recipe.id,
            title: recipe.title,
            summary: recipe.summary,
            servings: recipe.servings,
            category: recipe.category,
            cuisine: recipe.cuisine,
            tags: recipe.tags,
            personalRating: policy.shareRecipePreferences ? recipe.personalRating : null,
          }))
      : [],
    mealPlan: policy.shareMealPlans ? listPlannedMeals(resolvedRange.start, resolvedRange.end) : [],
    sharedCategories: {
      recipes: policy.shareSharedRecipes,
      mealPlans: policy.shareMealPlans,
    },
  };
}
