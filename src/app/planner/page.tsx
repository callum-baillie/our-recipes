import { cookies } from 'next/headers';
import { MealPlanner } from '@/components/meal-planner';
import { ACTIVE_PROFILE_COOKIE, getActorContext } from '@/lib/actor-context';
import {
  listCollections,
  listRecipeCollectionMemberships,
} from '@/lib/services/collection-service';
import { listProfiles } from '@/lib/services/household-service';
import { listPlannedMeals } from '@/lib/services/planning-service';
import { getProjectedPantryDemand } from '@/lib/services/pantry-availability-service';
import { getNutritionMealProjection } from '@/lib/services/nutrition-meal-planning-service';
import {
  listAccessibleNutritionProfiles,
  listNutritionGoalVersions,
} from '@/lib/services/nutrition-profile-service';
import { resolveNutritionHouseholdContext } from '@/lib/services/nutrition-household-profile-service';
import { listRecipes } from '@/lib/services/recipe-service';
import { isoDateSchema } from '@/lib/domain/planning';
import { addLocalDateDays, localIsoDate, localWeekRange } from '@/lib/domain/local-date';
import { latestNutritionSeries } from '@/lib/domain/nutrition-view';
import { getAppPreferences } from '@/lib/services/app-preferences-service';
import { getAiDataPolicy, getAiWorkloadSetting } from '@/lib/services/ai-settings-service';
import { AI_WORKLOAD_DEFAULTS } from '@/lib/domain/ai-assistant';

export const dynamic = 'force-dynamic';

type PlannerView = 'day' | 'week' | 'month';

function monthStart(date: string): string {
  return `${date.slice(0, 7)}-01`;
}

function shiftMonth(date: string, amount: number): string {
  const value = new Date(`${monthStart(date)}T12:00:00Z`);
  value.setUTCMonth(value.getUTCMonth() + amount);
  return value.toISOString().slice(0, 10);
}

function monthEnd(date: string): string {
  return addLocalDateDays(shiftMonth(date, 1), -1);
}

function plannerRange(
  candidate: string | undefined,
  view: PlannerView,
  weekStartsOn: 0 | 1,
  today: string,
) {
  const anchor = candidate ?? today;
  if (view === 'day') {
    return {
      periodStart: anchor,
      periodEnd: anchor,
      previousPeriodStart: addLocalDateDays(anchor, -1),
      nextPeriodStart: addLocalDateDays(anchor, 1),
    };
  }
  if (view === 'month') {
    const periodStart = monthStart(anchor);
    return {
      periodStart,
      periodEnd: monthEnd(periodStart),
      previousPeriodStart: shiftMonth(periodStart, -1),
      nextPeriodStart: shiftMonth(periodStart, 1),
    };
  }
  const range = localWeekRange(anchor, weekStartsOn);
  return {
    periodStart: range.weekStart,
    periodEnd: range.weekEnd,
    previousPeriodStart: addLocalDateDays(range.weekStart, -7),
    nextPeriodStart: addLocalDateDays(range.weekStart, 7),
  };
}

export default async function PlannerPage({
  searchParams,
}: {
  searchParams: Promise<{ week?: string; date?: string; view?: string }>;
}) {
  const requested = await searchParams;
  const viewMode: PlannerView =
    requested.view === 'day' || requested.view === 'month' ? requested.view : 'week';
  const selected = requested.date ?? requested.week;
  const plannerPreferences = getAppPreferences().mealPlan;
  const actor = getActorContext((await cookies()).get(ACTIVE_PROFILE_COOKIE)?.value);
  const nutritionHousehold = resolveNutritionHouseholdContext(actor);
  const today = localIsoDate(
    new Date(),
    nutritionHousehold.activeNutritionProfile.dailyResetTimezone,
  );
  const { periodStart, periodEnd, previousPeriodStart, nextPeriodStart } = plannerRange(
    isoDateSchema.safeParse(selected).success ? selected : undefined,
    viewMode,
    plannerPreferences.weekStartsOn,
    today,
  );
  const nutritionProfiles = listAccessibleNutritionProfiles(
    nutritionHousehold.compatibilityPrincipalId,
  );
  const activeNutritionProfile = nutritionProfiles.find(
    (profile) => profile.id === nutritionHousehold.activeNutritionProfile.id,
  )!;
  const nutritionProjection = getNutritionMealProjection(
    activeNutritionProfile.id,
    nutritionHousehold.compatibilityPrincipalId,
    { start: periodStart, end: periodEnd },
  );
  const plannedMeals = listPlannedMeals(periodStart, periodEnd);
  const pantryDemand = getProjectedPantryDemand(periodStart, periodEnd);
  const pantryStatusByMeal = Object.fromEntries(
    plannedMeals.map((meal) => {
      const lineStates = pantryDemand.lines.flatMap((line) =>
        line.meals.some((item) => item.mealPlanEntryId === meal.id) ? [line.state] : [],
      );
      const hasUnknown = pantryDemand.unknown.some((item) => item.mealPlanEntryId === meal.id);
      const state: 'covered' | 'shortage' | 'uncertain' | 'unknown' = lineStates.includes(
        'shortage',
      )
        ? 'shortage'
        : hasUnknown || lineStates.includes('uncertain')
          ? 'uncertain'
          : lineStates.length
            ? 'covered'
            : 'unknown';
      return [meal.id, state];
    }),
  );
  const nutritionGoals = activeNutritionProfile.canManageGoals
    ? latestNutritionSeries(
        listNutritionGoalVersions(
          activeNutritionProfile.id,
          nutritionHousehold.compatibilityPrincipalId,
        ),
      )
    : [];
  const householdProfiles = listProfiles();
  const nutritionByHouseholdProfile = new Map(
    nutritionHousehold.householdNutritionProfiles.flatMap((profile) =>
      profile.linkedHouseholdProfileId
        ? [[profile.linkedHouseholdProfileId, profile] as const]
        : [],
    ),
  );
  const plannerProfiles = householdProfiles.map(({ id, displayName }) => {
    const nutritionProfile = nutritionByHouseholdProfile.get(id);
    let hasGoals = false;
    if (nutritionProfile) {
      try {
        hasGoals =
          latestNutritionSeries(
            listNutritionGoalVersions(
              nutritionProfile.id,
              nutritionHousehold.compatibilityPrincipalId,
            ),
          ).length > 0;
      } catch {
        hasGoals = false;
      }
    }
    return {
      id,
      displayName,
      nutritionReady: Boolean(
        nutritionProfile && hasGoals && getAiDataPolicy(id).shareNutritionGoals,
      ),
    };
  });
  const mealPlanAiSetting = actor.profileId
    ? getAiWorkloadSetting(actor.profileId, 'meal_plan_generation')
    : { ...AI_WORKLOAD_DEFAULTS.meal_plan_generation, enabled: true };
  const imageAiSetting = actor.profileId
    ? getAiWorkloadSetting(actor.profileId, 'image_generation')
    : { ...AI_WORKLOAD_DEFAULTS.image_generation, enabled: true };
  return (
    <main className="recipe-page">
      <MealPlanner
        key={`${viewMode}:${periodStart}:${periodEnd}`}
        weekStart={periodStart}
        weekEnd={periodEnd}
        meals={plannedMeals}
        recipes={listRecipes()}
        profiles={plannerProfiles}
        collections={listCollections().map(({ id, name }) => ({ id, name }))}
        collectionMemberships={listRecipeCollectionMemberships()}
        previousWeekStart={previousPeriodStart}
        nextWeekStart={nextPeriodStart}
        viewMode={viewMode}
        weekStartsOn={plannerPreferences.weekStartsOn}
        today={today}
        nutritionByDate={nutritionProjection.totalsByDate}
        nutritionGoals={nutritionGoals.map((goal) => ({
          nutrientCode: goal.nutrientCode,
          kind: goal.kind,
          value: goal.value,
          minimum: goal.minimum,
          maximum: goal.maximum,
        }))}
        pantrySummary={{
          covered: pantryDemand.lines.filter((line) => line.state === 'covered').length,
          total: pantryDemand.lines.length + pantryDemand.unknown.length,
          missing:
            pantryDemand.lines.filter((line) => line.state !== 'covered').length +
            pantryDemand.unknown.length,
        }}
        pantryStatusByMeal={pantryStatusByMeal}
        defaultDuration={plannerPreferences.defaultDuration}
        defaultMealTypes={plannerPreferences.defaultMealTypes}
        mealPlanPreferences={plannerPreferences}
        aiMealPlanModel={mealPlanAiSetting.model}
        aiImageGenerationEnabled={imageAiSetting.enabled}
      />
    </main>
  );
}
