import { cookies } from 'next/headers';
import { redirect } from 'next/navigation';

import { NutritionDashboard, type NutritionView } from '@/components/nutrition-dashboard';
import { AiSummaryCards } from '@/components/ai-summary-cards';
import { ACTIVE_PROFILE_COOKIE, getActorContext } from '@/lib/actor-context';
import { evaluateNutritionInsights } from '@/lib/domain/nutrition-insights';
import { buildAdvancedNutritionCharts } from '@/lib/domain/nutrition-advanced-charts';
import { buildNutritionChartDatasets } from '@/lib/domain/nutrition-chart-datasets';
import { buildNutritionWeightTrend } from '@/lib/domain/nutrition-weight-trend';
import {
  latestNutritionSeries,
  nutritionLocalDateKey,
  summarizeNutritionDiary,
} from '@/lib/domain/nutrition-view';
import { getHouseholdNutritionComparison } from '@/lib/services/nutrition-comparison-service';
import { getIndividualNutritionChartWorkspace } from '@/lib/services/nutrition-individual-chart-service';
import { getNutritionMealProjection } from '@/lib/services/nutrition-meal-planning-service';
import { getPreparedServingWorkspace } from '@/lib/services/nutrition-prepared-consumption-service';
import { getNutritionRecommendations } from '@/lib/services/nutrition-recommendation-service';
import { getNutritionWeightTrendWorkspace } from '@/lib/services/nutrition-weight-trend-service';
import { listShoppingLists } from '@/lib/services/planning-service';
import { listNutrientDefinitions } from '@/lib/services/nutrition-foundation-service';
import {
  listNutritionIntakeRevisions,
  listNutritionMealAllocationVersions,
} from '@/lib/services/nutrition-intake-service';
import {
  listAccessibleNutritionProfiles,
  listNutritionGoalVersions,
} from '@/lib/services/nutrition-profile-service';
import { resolveNutritionHouseholdContext } from '@/lib/services/nutrition-household-profile-service';
import { getNutritionDataWorkspace } from '@/lib/services/nutrition-recipe-calculation-service';

export const dynamic = 'force-dynamic';

const HOUSEHOLD_RANGE_DAYS = new Set([7, 14, 30, 90]);

function addDays(isoDate: string, days: number): string {
  const value = new Date(`${isoDate}T12:00:00Z`);
  value.setUTCDate(value.getUTCDate() + days);
  return value.toISOString().slice(0, 10);
}

const VIEWS = new Set<NutritionView>([
  'overview',
  'diary',
  'nutrients',
  'trends',
  'household',
  'goals',
]);

export default async function NutritionPage({
  searchParams,
}: {
  searchParams: Promise<{ member?: string; range?: string; view?: string }>;
}) {
  const actor = getActorContext((await cookies()).get(ACTIVE_PROFILE_COOKIE)?.value);
  const household = resolveNutritionHouseholdContext(actor);
  const principalId = household.compatibilityPrincipalId;
  const profiles = listAccessibleNutritionProfiles(principalId);
  const requested = await searchParams;
  if (requested.view === 'settings') redirect('/settings/nutrition');
  const activeProfile = profiles.find(
    (profile) => profile.id === household.activeNutritionProfile.id,
  )!;
  const view = VIEWS.has(requested.view as NutritionView)
    ? (requested.view as NutritionView)
    : 'overview';
  const revisions =
    activeProfile.canViewDiary && view !== 'trends'
      ? listNutritionIntakeRevisions(activeProfile.id, principalId)
      : [];
  const summary = summarizeNutritionDiary(revisions, {
    timeZone: activeProfile.dailyResetTimezone,
    days: activeProfile.trendRangeDays,
  });
  const today = nutritionLocalDateKey(new Date(), activeProfile.dailyResetTimezone);
  const mealProjection =
    activeProfile.canViewDiary && view === 'overview'
      ? getNutritionMealProjection(activeProfile.id, principalId, {
          start: today,
          end: addDays(today, 6),
        })
      : { range: { start: today, end: addDays(today, 6) }, meals: [], totalsByDate: {} };
  const allocations = activeProfile.canViewDiary
    ? latestNutritionSeries(listNutritionMealAllocationVersions(activeProfile.id, principalId))
    : [];
  const allocationCounts = allocations.reduce<Record<string, number>>((counts, allocation) => {
    counts[allocation.state] = (counts[allocation.state] ?? 0) + 1;
    return counts;
  }, {});
  const goals =
    activeProfile.canManageGoals && view !== 'trends'
      ? latestNutritionSeries(listNutritionGoalVersions(activeProfile.id, principalId))
      : [];
  const observedDays = summary.trend.filter((day) => day.entryCount > 0).length;
  const trendDates = new Set(summary.trend.map((day) => day.date));
  const recentValues = summary.consumedEntries
    .filter((entry) =>
      trendDates.has(nutritionLocalDateKey(entry.occurredAt, activeProfile.dailyResetTimezone)),
    )
    .flatMap((entry) => entry.values);
  const coverageTotals = recentValues.reduce<Record<string, { total: number; count: number }>>(
    (result, value) => {
      const current = result[value.nutrientCode] ?? { total: 0, count: 0 };
      current.total += value.completeness;
      current.count += 1;
      result[value.nutrientCode] = current;
      return result;
    },
    {},
  );
  const insights = evaluateNutritionInsights({
    dailyAverages: Object.fromEntries(
      Object.entries(summary.sevenDayTotals).map(([code, amount]) => [
        code,
        observedDays > 0 ? amount / observedDays : amount,
      ]),
    ),
    goals,
    observedDays,
    coverageByNutrient: Object.fromEntries(
      Object.entries(coverageTotals).map(([code, value]) => [code, value.total / value.count]),
    ),
  });
  const requestedHouseholdRange = Number(requested.range);
  const householdRangeDays = HOUSEHOLD_RANGE_DAYS.has(requestedHouseholdRange)
    ? requestedHouseholdRange
    : 7;
  const householdComparisonBase = getHouseholdNutritionComparison(principalId, {
    periodDays: householdRangeDays,
  });
  const focusedHouseholdMember = householdComparisonBase.members.some(
    (member) => member.key === requested.member,
  )
    ? requested.member
    : activeProfile.id;
  const householdComparison = {
    ...householdComparisonBase,
    focusMemberKey: focusedHouseholdMember,
  };
  const definitions = listNutrientDefinitions().map((item) => ({
    code: item.code,
    displayName: item.displayName,
    canonicalUnit: item.canonicalUnit,
    category: item.category,
  }));
  const dataWorkspace = getNutritionDataWorkspace();
  const preparedWorkspace = activeProfile.canViewDiary
    ? getPreparedServingWorkspace(activeProfile.id, principalId)
    : [];
  const recommendations =
    view === 'overview' &&
    activeProfile.canViewDiary &&
    activeProfile.canManageProfile &&
    activeProfile.canManageGoals
      ? getNutritionRecommendations(activeProfile.id, principalId).map((item) => ({
          ...item,
          feedback: item.feedback
            ? {
                id: item.feedback.id,
                revision: item.feedback.revision,
                state: item.feedback.state,
                reason: item.feedback.reason,
              }
            : null,
        }))
      : [];
  const shoppingLists = listShoppingLists().map((list) => ({ id: list.id, name: list.name }));
  const chartDatasets = buildNutritionChartDatasets({
    profileLabel: activeProfile.displayName,
    date: today,
    confirmed: summary.todayTotals,
    planned: mealProjection.totalsByDate[today] ?? {},
    recentCompleteness: summary.averageCompleteness,
    visibleNutrientCodes: activeProfile.visibleNutrientCodes,
    showPlannedNutrition: activeProfile.showPlannedNutrition,
    goals: goals.map((goal) => ({
      id: goal.id,
      nutrientCode: goal.nutrientCode,
      kind: goal.kind,
      value: goal.value,
      minimum: goal.minimum,
      maximum: goal.maximum,
      unit: goal.unit,
      sourceType: goal.sourceType,
      state: goal.state,
      startsOn: goal.startsOn,
      endsOn: goal.endsOn,
    })),
  });
  const advancedCharts =
    view === 'trends' && activeProfile.canViewDiary
      ? buildAdvancedNutritionCharts(
          getIndividualNutritionChartWorkspace(activeProfile.id, principalId, {
            endDate: today,
            days: activeProfile.trendRangeDays,
            selectedNutrients: activeProfile.visibleNutrientCodes,
          }),
        )
      : null;
  const weightTrend =
    view === 'trends' && activeProfile.canViewMeasurements
      ? buildNutritionWeightTrend(
          getNutritionWeightTrendWorkspace(activeProfile.id, principalId, {
            endDate: today,
            days: activeProfile.trendRangeDays,
          }),
        )
      : null;

  return (
    <>
      <NutritionDashboard
        principalId={principalId}
        profiles={profiles}
        activeProfile={activeProfile}
        view={view}
        summary={{
          currentEntries: summary.currentEntries.map((entry) => {
            const full = revisions.find((revision) => revision.id === entry.id)!;
            return {
              id: full.id,
              revision: full.revision,
              occurredAt: full.occurredAt.toISOString(),
              state: full.state,
              sourceNameSnapshot: full.sourceNameSnapshot,
              mealSlot: full.mealSlot,
              sourceType: full.sourceType,
              recipeId: full.recipeId,
              productId: full.productId,
              recipeCalculationId: full.recipeCalculationId,
              quantity: full.quantity,
              unit: full.unit,
              servingCount: full.servingCount,
              values: full.values.map((value) => ({
                nutrientCode: value.nutrientCode,
                amount: value.amount,
                confidence: value.confidence,
                completeness: value.completeness,
                estimated: value.estimated,
              })),
            };
          }),
          todayTotals: summary.todayTotals,
          sevenDayTotals: summary.sevenDayTotals,
          trend: summary.trend,
          averageCompleteness: summary.averageCompleteness,
          averageConfidence: summary.averageConfidence,
          hasEstimatedValues: summary.hasEstimatedValues,
        }}
        definitions={definitions}
        goals={goals}
        allocationCounts={allocationCounts}
        mealProjection={mealProjection}
        today={today}
        insights={insights}
        recommendations={recommendations}
        shoppingLists={shoppingLists}
        householdComparison={householdComparison}
        chartDatasets={chartDatasets}
        advancedCharts={advancedCharts}
        weightTrend={weightTrend}
        dataWorkspace={dataWorkspace}
        preparedWorkspace={preparedWorkspace}
      />
      <AiSummaryCards kinds={['daily_nutrition', 'weekly_nutrition']} />
    </>
  );
}
