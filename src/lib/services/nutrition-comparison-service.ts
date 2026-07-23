import 'server-only';

import { and, desc, eq, gte, inArray, isNotNull, isNull, lte, or } from 'drizzle-orm';

import { ensureDatabase, getDatabase } from '@/lib/db/client';
import {
  mealPlanEntries,
  nutritionGoalVersions,
  nutritionIntakeNutrientValues,
  nutritionIntakeRevisions,
  nutritionMealAllocationVersions,
  nutritionProfiles,
} from '@/lib/db/schema';
import { evaluateNutritionGoal, type NutritionGoal } from '@/lib/domain/nutrition';
import { allocationOccupiesServing } from '@/lib/domain/nutrition-meal-planning';
import { nutritionLocalDateKey } from '@/lib/domain/nutrition-view';
import { NutritionProfileForbiddenError } from '@/lib/services/nutrition-profile-service';

const ALLOCATION_STATES = ['planned', 'served', 'eaten', 'skipped', 'leftover'] as const;
type AllocationState = (typeof ALLOCATION_STATES)[number];
type AllocationServings = Record<AllocationState, number | null>;

export type HouseholdNutritionComparison = {
  periodDays: number;
  range: { start: string; end: string };
  allocationSummary: {
    plannedMealServings: number | null;
    unassignedServings: number | null;
    unknownServingAllocations: number;
  };
  members: Array<{
    key: string;
    label: string;
    visibility: 'named';
    status: 'ready' | 'insufficient_data';
    observedDays: number;
    confirmedCount: number;
    allocationServings: AllocationServings;
    averageCompleteness: number | null;
    nutrients: Array<{
      nutrientCode: string;
      normalizedPercent: number;
      semantic: 'coverage' | 'range-position' | 'limit-usage';
      status: 'below' | 'within' | 'above' | 'met';
      coverage: number;
      observedDays: number;
    }>;
  }>;
};

function addDays(date: string, days: number): string {
  const value = new Date(`${date}T12:00:00Z`);
  value.setUTCDate(value.getUTCDate() + days);
  return value.toISOString().slice(0, 10);
}

function goalValue(goal: typeof nutritionGoalVersions.$inferSelect): NutritionGoal | null {
  if (goal.kind === 'target' || goal.kind === 'minimum') {
    return goal.value === null ? null : { kind: goal.kind, value: goal.value };
  }
  if (goal.kind === 'range') {
    return goal.minimum === null || goal.maximum === null
      ? null
      : { kind: 'range', minimum: goal.minimum, maximum: goal.maximum };
  }
  return goal.maximum === null ? null : { kind: 'limit', maximum: goal.maximum };
}

function allocationServings(
  allocations: Array<typeof nutritionMealAllocationVersions.$inferSelect>,
): AllocationServings {
  return Object.fromEntries(
    ALLOCATION_STATES.map((state) => {
      const matching = allocations.filter((allocation) => allocation.state === state);
      return [
        state,
        matching.length === 0 || matching.some((allocation) => allocation.servings === null)
          ? null
          : matching.reduce((sum, allocation) => sum + allocation.servings!, 0),
      ];
    }),
  ) as AllocationServings;
}

export function getHouseholdNutritionComparison(
  requesterPrincipalId: string,
  options: { now?: Date; periodDays?: number } = {},
): HouseholdNutritionComparison {
  ensureDatabase();
  const database = getDatabase();
  const now = options.now ?? new Date();
  const periodDays = options.periodDays ?? 7;
  if (!Number.isInteger(periodDays) || periodDays < 3 || periodDays > 90) {
    throw new Error('Household comparison period must be between 3 and 90 days.');
  }
  const requesterProfiles = database
    .select()
    .from(nutritionProfiles)
    .where(
      and(
        eq(nutritionProfiles.ownerPrincipalId, requesterPrincipalId),
        isNotNull(nutritionProfiles.linkedHouseholdProfileId),
        isNull(nutritionProfiles.archivedAt),
      ),
    )
    .all();
  if (requesterProfiles.length !== 1) {
    throw new NutritionProfileForbiddenError(
      'Household comparison requires one unambiguous active linked Nutrition profile.',
    );
  }

  const profiles = database
    .select()
    .from(nutritionProfiles)
    .where(
      and(
        isNotNull(nutritionProfiles.linkedHouseholdProfileId),
        isNull(nutritionProfiles.archivedAt),
      ),
    )
    .all();
  const memberRanges = new Map(
    profiles.map((profile) => {
      const end = nutritionLocalDateKey(now, profile.dailyResetTimezone);
      return [profile.id, { start: addDays(end, -(periodDays - 1)), end }] as const;
    }),
  );
  const requesterRange = memberRanges.get(requesterProfiles[0]!.id)!;
  const profileIds = profiles.map((profile) => profile.id);
  if (profileIds.length === 0) {
    return {
      periodDays,
      range: requesterRange,
      allocationSummary: {
        plannedMealServings: null,
        unassignedServings: null,
        unknownServingAllocations: 0,
      },
      members: [],
    };
  }
  const allStarts = [...memberRanges.values()].map((range) => range.start).sort();
  const allEnds = [...memberRanges.values()].map((range) => range.end).sort();
  const queryStart = allStarts[0]!;
  const queryEnd = allEnds.at(-1)!;
  const intakeCutoff = new Date(`${addDays(queryStart, -1)}T00:00:00Z`);

  const intakeRows = database
    .select()
    .from(nutritionIntakeRevisions)
    .where(
      and(
        inArray(nutritionIntakeRevisions.nutritionProfileId, profileIds),
        gte(nutritionIntakeRevisions.occurredAt, intakeCutoff),
        lte(nutritionIntakeRevisions.occurredAt, now),
      ),
    )
    .orderBy(desc(nutritionIntakeRevisions.revision))
    .all();
  const latestIntake = new Map<string, (typeof intakeRows)[number]>();
  for (const row of intakeRows) {
    if (!latestIntake.has(row.seriesId)) latestIntake.set(row.seriesId, row);
  }
  const confirmed = [...latestIntake.values()].filter((row) => {
    if (row.state !== 'eaten' && row.state !== 'corrected') return false;
    const profile = profiles.find((candidate) => candidate.id === row.nutritionProfileId)!;
    const range = memberRanges.get(profile.id)!;
    const date = nutritionLocalDateKey(row.occurredAt, profile.dailyResetTimezone);
    return date >= range.start && date <= range.end;
  });
  const nutrientRows = confirmed.length
    ? database
        .select()
        .from(nutritionIntakeNutrientValues)
        .where(
          inArray(
            nutritionIntakeNutrientValues.intakeRevisionId,
            confirmed.map((row) => row.id),
          ),
        )
        .all()
    : [];
  const goals = database
    .select()
    .from(nutritionGoalVersions)
    .where(
      and(
        inArray(nutritionGoalVersions.nutritionProfileId, profileIds),
        lte(nutritionGoalVersions.startsOn, queryEnd),
        or(isNull(nutritionGoalVersions.endsOn), gte(nutritionGoalVersions.endsOn, queryStart)),
      ),
    )
    .orderBy(desc(nutritionGoalVersions.revision))
    .all();
  const plannedMeals = database
    .select({ id: mealPlanEntries.id, servings: mealPlanEntries.servings })
    .from(mealPlanEntries)
    .where(
      and(gte(mealPlanEntries.plannedFor, queryStart), lte(mealPlanEntries.plannedFor, queryEnd)),
    )
    .all();
  const allocationRows = database
    .select({ allocation: nutritionMealAllocationVersions, plannedFor: mealPlanEntries.plannedFor })
    .from(nutritionMealAllocationVersions)
    .leftJoin(
      mealPlanEntries,
      eq(nutritionMealAllocationVersions.mealPlanEntryId, mealPlanEntries.id),
    )
    .where(
      and(
        inArray(nutritionMealAllocationVersions.nutritionProfileId, profileIds),
        or(
          and(
            gte(mealPlanEntries.plannedFor, queryStart),
            lte(mealPlanEntries.plannedFor, queryEnd),
          ),
          and(
            isNull(nutritionMealAllocationVersions.mealPlanEntryId),
            gte(nutritionMealAllocationVersions.createdAt, intakeCutoff),
            lte(nutritionMealAllocationVersions.createdAt, now),
          ),
        ),
      ),
    )
    .orderBy(desc(nutritionMealAllocationVersions.revision))
    .all();
  const latestAllocations = new Map<string, (typeof allocationRows)[number]>();
  for (const row of allocationRows) {
    if (!latestAllocations.has(row.allocation.seriesId))
      latestAllocations.set(row.allocation.seriesId, row);
  }
  const currentAllocations = [...latestAllocations.values()];
  const requestedMeals = plannedMeals;
  let unknownServingAllocations = 0;
  let unassignedServings = 0;
  for (const meal of requestedMeals) {
    const occupying = currentAllocations
      .map((row) => row.allocation)
      .filter(
        (allocation) =>
          allocation.mealPlanEntryId === meal.id && allocationOccupiesServing(allocation.state),
      );
    if (occupying.some((allocation) => allocation.servings === null)) {
      unknownServingAllocations += occupying.filter(
        (allocation) => allocation.servings === null,
      ).length;
      continue;
    }
    unassignedServings += Math.max(
      0,
      meal.servings - occupying.reduce((sum, allocation) => sum + allocation.servings!, 0),
    );
  }

  return {
    periodDays,
    range: requesterRange,
    allocationSummary: {
      plannedMealServings: requestedMeals.length
        ? requestedMeals.reduce((sum, meal) => sum + meal.servings, 0)
        : null,
      unassignedServings:
        requestedMeals.length === 0 || unknownServingAllocations > 0 ? null : unassignedServings,
      unknownServingAllocations,
    },
    members: profiles.map((profile) => {
      const range = memberRanges.get(profile.id)!;
      const memberIntake = confirmed.filter((row) => row.nutritionProfileId === profile.id);
      const memberValues = nutrientRows.filter((value) =>
        memberIntake.some((row) => row.id === value.intakeRevisionId),
      );
      const observedDays = new Set(
        memberIntake.map((row) =>
          nutritionLocalDateKey(row.occurredAt, profile.dailyResetTimezone),
        ),
      ).size;
      const totals = new Map<
        string,
        { amount: number; completeness: number; count: number; dates: Set<string> }
      >();
      for (const value of memberValues) {
        const intake = memberIntake.find((row) => row.id === value.intakeRevisionId)!;
        const current = totals.get(value.nutrientCode) ?? {
          amount: 0,
          completeness: 0,
          count: 0,
          dates: new Set<string>(),
        };
        current.amount += value.amount;
        current.completeness += value.completeness;
        current.count += 1;
        current.dates.add(nutritionLocalDateKey(intake.occurredAt, profile.dailyResetTimezone));
        totals.set(value.nutrientCode, current);
      }
      const latestGoals = new Map<string, (typeof goals)[number]>();
      for (const goal of goals) {
        if (
          goal.nutritionProfileId === profile.id &&
          goal.startsOn <= range.end &&
          (!goal.endsOn || goal.endsOn >= range.end) &&
          !latestGoals.has(goal.seriesId)
        ) {
          latestGoals.set(goal.seriesId, goal);
        }
      }
      const nutrients = [...latestGoals.values()].flatMap((goal) => {
        const total = totals.get(goal.nutrientCode);
        const configuredGoal = goalValue(goal);
        if (
          goal.state !== 'active' ||
          !total ||
          !configuredGoal ||
          total.dates.size < 3 ||
          total.completeness / total.count < 0.5
        ) {
          return [];
        }
        const evaluation = evaluateNutritionGoal(total.amount / total.dates.size, configuredGoal);
        return [
          {
            nutrientCode: goal.nutrientCode,
            normalizedPercent:
              goal.kind === 'range'
                ? evaluation.status === 'below'
                  ? (evaluation.percentOfMinimum ?? 0)
                  : evaluation.status === 'above'
                    ? (evaluation.percentOfMaximum ?? 0)
                    : 100
                : (evaluation.coveragePercent ?? evaluation.percentOfMaximum ?? 0),
            semantic:
              goal.kind === 'range'
                ? ('range-position' as const)
                : goal.kind === 'limit'
                  ? ('limit-usage' as const)
                  : ('coverage' as const),
            status: evaluation.status,
            coverage: total.completeness / total.count,
            observedDays: total.dates.size,
          },
        ];
      });
      const allocations = currentAllocations
        .filter((row) => {
          if (row.allocation.nutritionProfileId !== profile.id) return false;
          if (row.plannedFor !== null)
            return row.plannedFor >= range.start && row.plannedFor <= range.end;
          const date = nutritionLocalDateKey(row.allocation.createdAt, profile.dailyResetTimezone);
          return date >= range.start && date <= range.end;
        })
        .map((row) => row.allocation);
      const averageCompleteness = memberValues.length
        ? memberValues.reduce((sum, value) => sum + value.completeness, 0) / memberValues.length
        : null;
      return {
        key: profile.id,
        label: profile.displayName,
        visibility: 'named' as const,
        status: nutrients.length ? ('ready' as const) : ('insufficient_data' as const),
        observedDays,
        confirmedCount: memberIntake.length,
        allocationServings: allocationServings(allocations),
        averageCompleteness,
        nutrients,
      };
    }),
  };
}
