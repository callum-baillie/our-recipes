import 'server-only';

import { createHmac } from 'node:crypto';

import { getRuntimeConfig } from '@/lib/config';
import { addLocalDateDays, localIsoDate } from '@/lib/domain/local-date';
import { summarizeNutritionDiary } from '@/lib/domain/nutrition-view';
import { hasProfileGoalContext } from '@/lib/domain/profile-goals';
import { getAiDataPolicy } from '@/lib/services/ai-settings-service';
import { getProfile, listProfiles } from '@/lib/services/household-service';
import type { RequestPrincipal } from '@/lib/services/auth-service';
import { appRoleCan } from '@/lib/domain/permissions';
import { listNutritionIntakeRevisions } from '@/lib/services/nutrition-intake-service';
import { resolveNutritionHouseholdContext } from '@/lib/services/nutrition-household-profile-service';
import { bodyMetricsSchema } from '@/lib/domain/body-metrics';
import { completedAgeOn } from '@/lib/domain/nutrition-energy-estimate';
import { getPantryDashboard } from '@/lib/services/pantry-service';
import {
  listBodyMeasurements,
  listNutritionGoalVersions,
} from '@/lib/services/nutrition-profile-service';
import {
  getShoppingList,
  listShoppingLists,
  listPlannedMeals,
} from '@/lib/services/planning-service';
import { getRecipe, listRecipeLibrary } from '@/lib/services/recipe-service';
import { getListSettings, listSupermarketProfiles } from '@/lib/services/list-settings-service';

export function canAiReadHouseholdProfiles(actorProfileId: string, principal?: RequestPrincipal) {
  return Boolean(
    principal &&
    principal.profileId === actorProfileId &&
    appRoleCan(principal.accountRole, 'shared.update') &&
    appRoleCan(principal.role, 'shared.update'),
  );
}

function sharedBodyMetrics(raw: string, shareWeight: boolean) {
  try {
    const parsed = bodyMetricsSchema.safeParse(JSON.parse(raw));
    if (!parsed.success) return {};
    return Object.fromEntries(
      Object.entries(parsed.data).filter(
        ([key, value]) => value != null && (shareWeight || !key.endsWith('Kilograms')),
      ),
    );
  } catch {
    return {};
  }
}

export function aiSafetyIdentifier(profileId: string): string {
  return createHmac('sha256', getRuntimeConfig().cookieSecret)
    .update(`openai-safety:${profileId}`)
    .digest('base64url')
    .slice(0, 64);
}

export function buildAiHouseholdPlanningContext(
  actorProfileId: string,
  principal?: RequestPrincipal,
) {
  const canPlanForHousehold = canAiReadHouseholdProfiles(actorProfileId, principal);
  const members = listProfiles().filter(
    (profile) => canPlanForHousehold || profile.id === actorProfileId,
  );
  return {
    canPlanForHousehold,
    activeProfileKey: actorProfileId,
    memberCount: members.length,
    members: members.map((profile, index) => {
      const identityShared = getAiDataPolicy(profile.id).shareIdentity;
      return {
        key: profile.id,
        active: profile.id === actorProfileId,
        identityShared,
        label: identityShared ? profile.displayName : `Household member ${index + 1}`,
      };
    }),
    note: 'Every listed member can be selected for meal planning by key, including members whose names or nutrition data are withheld. An unnamed member is not a missing profile. Never infer their identity. If a requested name cannot be resolved, explain that Name and identity sharing is disabled for unnamed members; all-member planning can still proceed without names.',
  };
}

export function buildAiProfileContext(actorProfileId: string, principal?: RequestPrincipal) {
  const household = resolveNutritionHouseholdContext({
    profileId: actorProfileId,
    source: 'profile-cookie',
  });
  return household.householdNutritionProfiles
    .filter(
      (profile) =>
        !profile.archivedAt &&
        (!principal ||
          canAiReadHouseholdProfiles(actorProfileId, principal) ||
          profile.linkedHouseholdProfileId === actorProfileId),
    )
    .map((profile) => {
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
        sharing: {
          identity: policy.shareIdentity,
          dietaryPreferences: policy.shareDietaryPreferences,
          profileGoals: policy.shareProfileGoals,
          nutritionGoals: policy.shareNutritionGoals,
          nutritionAggregates: policy.shareNutritionAggregates,
          rawDiary: policy.shareRawDiary,
          personalMetrics: policy.sharePersonalMetrics,
          weight: policy.shareWeight,
        },
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
        if (profile.dateOfBirth) {
          const effectiveOn = localIsoDate(new Date(), profile.dailyResetTimezone);
          try {
            context.ageYears = completedAgeOn(profile.dateOfBirth, effectiveOn);
          } catch {
            context.ageUnavailable = true;
          }
        }
        context.enteredBodyMetrics = sharedBodyMetrics(
          profile.advancedBodyMetrics,
          policy.shareWeight,
        );
        context.heightCentimeters = profile.heightCentimeters;
        context.referenceSexCategory = profile.referenceSexCategory;
        context.explicitlyEnteredLifeStage = profile.explicitlyEnteredLifeStage;
      }
      if (policy.shareWeight) {
        context.currentWeightKilograms = profile.currentWeightKilograms;
        context.targetWeightKilograms = profile.targetWeightKilograms;
        context.weightTargetDate = profile.targetDate;
      }
      if (policy.sharePersonalMetrics || policy.shareWeight) {
        try {
          const latest = listBodyMeasurements(profile.id, household.compatibilityPrincipalId)[0];
          if (latest)
            context.latestRecordedMeasurement = {
              measuredAt: latest.measuredAt,
              source: latest.sourceType,
              approximate: latest.approximate,
              ...(policy.shareWeight ? { weightKilograms: latest.weightKilograms } : {}),
              ...(policy.sharePersonalMetrics
                ? {
                    bodyMetrics: sharedBodyMetrics(latest.advancedBodyMetrics, policy.shareWeight),
                  }
                : {}),
            };
        } catch {
          context.measurementsUnavailable = true;
        }
      }
      if (policy.shareNutritionGoals) {
        context.nutritionGoalType = profile.nutritionGoalType;
        context.weightGoalPace = profile.weightGoalPace;
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
  principal?: RequestPrincipal,
) {
  const policy = getAiDataPolicy(actorProfileId);
  const household = resolveNutritionHouseholdContext({
    profileId: actorProfileId,
    source: 'profile-cookie',
  });
  const today = localIsoDate(new Date(), household.activeNutritionProfile.dailyResetTimezone);
  const resolvedRange = range ?? { start: today, end: addLocalDateDays(today, 13) };
  const recipeLibrary = policy.shareSharedRecipes
    ? listRecipeLibrary(
        { q: '', status: 'active', sort: 'recently-updated', page: 1 },
        policy.shareRecipePreferences ? actorProfileId : null,
        100,
      )
    : null;
  const pantry = policy.sharePantry ? getPantryDashboard().batches : [];
  const lists = policy.shareShoppingLists ? listShoppingLists() : [];
  return {
    capturedAt: new Date().toISOString(),
    mealPlanRange: resolvedRange,
    coverage: {
      recipeTotal: recipeLibrary?.total ?? 0,
      recipeLimit: 100,
      pantryTotal: pantry.length,
      pantryLimit: 100,
      shoppingListTotal: lists.length,
      shoppingListLimit: 10,
    },
    pantry: pantry.slice(0, 100).map((batch) => ({
      id: batch.id,
      product: batch.product.displayName,
      brand: batch.product.brand,
      variant: batch.product.variant,
      quantity: batch.quantityRemaining,
      unit: batch.unit,
      quantityLabel: batch.quantityLabel,
      status: batch.status,
      expiry: batch.expiry,
    })),
    shoppingLists: lists.slice(0, 10).map((list) => {
      const detail = getShoppingList(list.id);
      const items = detail?.items ?? [];
      return {
        id: list.id,
        name: list.name,
        supermarketProfileId: list.supermarketProfileId,
        totalItems: items.length,
        itemLimit: 50,
        items: items.slice(0, 50).map((item) => ({
          id: item.id,
          item: item.item,
          quantity: item.quantity,
          unit: item.unit,
          note: item.note,
          checked: item.checked,
          shoppingState: item.shoppingState,
        })),
      };
    }),
    profiles: buildAiProfileContext(actorProfileId, principal),
    preferences: buildAiPreferencesContext(actorProfileId, principal),
    supermarkets: policy.shareShoppingLists
      ? listSupermarketProfiles()
          .slice(0, 25)
          .map(({ id, name, locationLabel, sections }) => ({
            id,
            name,
            locationLabel,
            sections: sections.slice(0, 100).map(({ id, aisleId, name, position }) => ({
              id,
              aisleId,
              name,
              position,
            })),
            sectionTotal: sections.length,
          }))
      : [],
    recipes: policy.shareSharedRecipes
      ? (recipeLibrary?.recipes ?? []).map((recipe) => ({
          id: recipe.id,
          title: recipe.title,
          summary: recipe.summary,
          servings: recipe.servings,
          category: recipe.category,
          cuisine: recipe.cuisine,
          tags: recipe.tags,
          prepMinutes: recipe.prepMinutes,
          cookMinutes: recipe.cookMinutes,
          ingredients: getRecipe(recipe.id)
            ?.ingredientGroups.flatMap((group) => group.ingredients)
            .map(({ quantity, unit, item, note }) => ({
              quantity,
              unit,
              item,
              note,
            })),
          personalRating: policy.shareRecipePreferences ? recipe.personalRating : null,
        }))
      : [],
    mealPlan: buildAiMealPlanContext(actorProfileId, resolvedRange.start, resolvedRange.end),
    sharedCategories: {
      pantry: policy.sharePantry,
      shoppingLists: policy.shareShoppingLists,
      recipes: policy.shareSharedRecipes,
      mealPlans: policy.shareMealPlans,
    },
  };
}

export function buildAiMealPlanContext(actorProfileId: string, start: string, end: string) {
  const policy = getAiDataPolicy(actorProfileId);
  if (!policy.shareMealPlans) return [];
  return listPlannedMeals(start, end).map((meal) => ({
    ...meal,
    // The schedule is usable even when sharing the underlying recipe is disabled.
    recipeOverride: policy.shareSharedRecipes ? meal.recipeOverride : null,
    recipeIngredientsSnapshot: policy.shareSharedRecipes
      ? meal.recipeIngredientsSnapshot
      : '{"baseServings":"","ingredients":[]}',
  }));
}

export function buildAiPreferencesContext(actorProfileId: string, principal?: RequestPrincipal) {
  const policy = getAiDataPolicy(actorProfileId);
  return {
    profiles: listProfiles()
      .filter(
        (profile) =>
          profile.id === actorProfileId || canAiReadHouseholdProfiles(actorProfileId, principal),
      )
      .map(({ id, units, temperatureUnit, locale, timezone }) => ({
        key: id,
        units,
        temperatureUnit,
        locale,
        timezone,
      })),
    shopping: policy.shareShoppingLists ? getListSettings() : null,
    sharing: {
      pantry: policy.sharePantry,
      shoppingLists: policy.shareShoppingLists,
      supermarkets: policy.shareShoppingLists,
      mealPlans: policy.shareMealPlans,
      recipes: policy.shareSharedRecipes,
    },
    dataScope:
      'Pantry, shopping lists, supermarkets and meal plans are shared household records. Nutrition and personal preferences belong to individual profiles. Sharing disabled means withheld, not empty.',
  };
}
