'use client';

import { ToastNotice } from './toast-provider';

import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { useEffect, useRef, useState, type FormEvent } from 'react';
import { ChevronDown, ChevronLeft, ChevronRight, Plus, UserCircle, X } from 'lucide-react';
import { PageHeader } from './page-header';
import { AppDialog } from './app-dialog';
import {
  NutritionRecordingDialog,
  NutritionRecordForm,
  type NutritionRecordMode,
} from './nutrition-recording';
import { NutritionGoalDialog } from './nutrition-goal-dialog';
import { NutritionDiaryEntry } from './nutrition-diary-entry';
import { NutritionFeedback } from './nutrition-form-fields';
import { useNutritionRequest } from './use-nutrition-request';
import { NutritionInsights } from './nutrition-insights';
import { NutritionScaleSettings, type LatestWeighIn } from './nutrition-scale-settings';
import { DecisionAssistance } from './decision-assistance';
import { NutritionChartPanels } from './nutrition-chart-panels';
import { NutritionDataWorkspace } from './nutrition-data-workspace';
import { NutritionHouseholdWorkspace } from './nutrition-household-workspace';
import { NutritionMealPlanning, type NutritionMealProjectionView } from './nutrition-meal-planning';
import {
  NutritionPreparedWorkspace,
  type PreparedServingWorkspace,
} from './nutrition-prepared-workspace';
import { NutritionSetupOverview } from './nutrition-setup-overview';
import {
  NutritionAdvancedChartPanels,
  NutritionWeightTrendPanel,
} from './nutrition-advanced-chart-panels';
import { NutritionVisualMarker } from './nutrition-visual-marker';
import { nutritionLocalDateKey } from '@/lib/domain/nutrition-view';
import {
  isNutritionDate,
  nutritionKnownAverage,
  displayNutritionWeight,
  nutritionPortion,
} from '@/lib/domain/nutrition-ui';
import {
  nutritionGoalComparison,
  type NutritionChartDatasets,
  type ChartGoal,
} from '@/lib/domain/nutrition-chart-datasets';
import type { AiSummaryCardData } from './ai-summary-cards';
import type { AdvancedNutritionCharts } from '@/lib/domain/nutrition-advanced-charts';
import type { NutritionWeightTrend } from '@/lib/domain/nutrition-weight-trend';
import styles from './nutrition-dashboard.module.css';

const VIEWS = ['overview', 'diary', 'nutrients', 'trends', 'household'] as const;
export type NutritionView = (typeof VIEWS)[number];

const VIEW_LABELS: Record<NutritionView, string> = {
  overview: 'Today',
  diary: 'Food Diary',
  nutrients: 'Nutrients',
  trends: 'Trends',
  household: 'Household',
};

const VIEW_EXPLAINERS: Record<NutritionView, string> = {
  overview: 'Your food, daily totals, and upcoming meals in one place.',
  diary: 'Choose a day to see your meals, log food, or update a portion.',
  nutrients: 'Confirmed nutrient amounts and coverage. A missing value means unknown, never zero.',
  trends:
    'Patterns across recorded days. Trends appear only when enough comparable diary data exists.',
  household:
    'Separate, privacy-aware views of each person’s recorded intake and assigned meal portions.',
};
export type ProfileSummary = {
  id: string;
  linkedHouseholdProfileId?: string | null;
  displayName: string;
  profileType: string;
  relationship: string;
  canViewDiary: boolean;
  canViewMeasurements: boolean;
  canManageProfile: boolean;
  canManageGoals: boolean;
  canExportData?: boolean;
  canDeleteData?: boolean;
  version?: number;
  measurementSystem?: 'metric' | 'imperial';
  trendRangeDays?: 7 | 14 | 30;
  dailyResetTimezone?: string;
  showPlannedNutrition?: boolean;
  weightTrackingEnabled?: boolean;
};
export type DiaryEntry = {
  id: string;
  revision: number;
  occurredAt: string;
  state: string;
  sourceNameSnapshot: string;
  mealSlot: string;
  sourceType: 'recipe' | 'product' | 'manual';
  recipeId: string | null;
  productId: string | null;
  recipeCalculationId: string | null;
  quantity: number | null;
  unit: string | null;
  servingCount: number | null;
  portionWeightGrams?: number | null;
  revisionReason?: string;
  values: ReadonlyArray<{
    nutrientCode: string;
    amount: number;
    completeness: number;
    confidence: number;
    estimated: boolean;
  }>;
};
type DashboardSummary = {
  currentEntries: DiaryEntry[];
  todayTotals: Record<string, number>;
  sevenDayTotals: Record<string, number>;
  trend: Array<{ date: string; energyKcal: number | null; entryCount: number }>;
  averageCompleteness: number | null;
  averageConfidence: number | null;
  hasEstimatedValues: boolean;
};
export type NutrientDefinition = {
  code: string;
  displayName: string;
  canonicalUnit: string;
  category: string;
};
export type Goal = {
  id: string;
  seriesId?: string;
  revision?: number;
  startsOn?: string;
  endsOn?: string | null;
  nutrientCode: string;
  kind: string;
  value: number | null;
  minimum: number | null;
  maximum: number | null;
  unit: string;
  sourceType: string;
  state: string;
};
export type NutritionGoalSetup = {
  nutritionGoalType: 'none' | 'maintain' | 'gain' | 'loss' | 'custom';
  currentWeightKilograms: number | null;
  targetWeightKilograms: number | null;
  targetDate: string | null;
  profileVersion: number;
};
type Insight = {
  goals: Array<{
    nutrientCode: string;
    status: string;
    percentOfGoal: number | null;
    message: string;
  }>;
  suggestions: Array<{ nutrientCode: string; tone: string; message: string }>;
  qualityMessage: string;
};
type HouseholdComparison = {
  periodDays: number;
  range: { start: string; end: string };
  members: Array<{
    key: string;
    label: string;
    visibility: 'named';
    status: 'ready' | 'insufficient_data';
    observedDays: number;
    confirmedCount: number;
    allocationServings: Record<
      'planned' | 'served' | 'eaten' | 'skipped' | 'leftover',
      number | null
    >;
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
  allocationSummary: {
    plannedMealServings: number | null;
    unassignedServings: number | null;
    unknownServingAllocations: number;
  };
};
type Recommendation = {
  key: string;
  kind: 'recurring_gap' | 'planned_gap';
  nutrientCode: string;
  gapAmount: number;
  unit: string;
  recipeId: string;
  recipeTitle: string;
  nutrientAmountPerServing: number;
  gapCoveragePercent: number;
  completeness: number;
  confidence: number;
  pantryState: 'ready' | 'partial' | 'unknown';
  expiringProductNames: string[];
  shortages: Array<{
    productId: string;
    productName: string;
    quantity: number;
    unit: string;
  }>;
  pantryUnknownReasons: string[];
  explanation: string;
  feedback: {
    id: string;
    revision: number;
    state: 'dismissed' | 'helpful' | 'not_helpful';
    reason: string;
  } | null;
};

export type NutritionDashboardProps = {
  initialGoalsOpen?: boolean;
  initialDiaryDate?: string;
  initialTask?: string;
  initialLogMode?: 'product' | 'recipe' | 'manual' | 'weight';
  initialRecipeId?: string;
  returnLogMode?: string;
  initialOpenPortions?: boolean;
  principalId: string;
  profiles: ProfileSummary[];
  activeProfile: ProfileSummary;
  view: NutritionView;
  summary: DashboardSummary;
  definitions: NutrientDefinition[];
  goals: Goal[];
  goalSetup?: NutritionGoalSetup | null;
  allocationCounts: Record<string, number>;
  mealProjection?: NutritionMealProjectionView;
  today?: string;
  insights: Insight;
  recommendations?: Recommendation[];
  shoppingLists?: Array<{ id: string; name: string }>;
  householdComparison: HouseholdComparison;
  chartDatasets: NutritionChartDatasets;
  advancedCharts?: AdvancedNutritionCharts | null;
  weightTrend?: NutritionWeightTrend | null;
  latestWeighIn?: LatestWeighIn | null;
  dataWorkspace?: Parameters<typeof NutritionDataWorkspace>[0]['workspace'];
  preparedWorkspace?: PreparedServingWorkspace;
  initialAiSummary?: AiSummaryCardData | null;
};

function number(value: number | undefined | null, digits = 1) {
  return value == null ? '—' : value.toLocaleString(undefined, { maximumFractionDigits: digits });
}
function readableDate(date: string) {
  return new Intl.DateTimeFormat(undefined, {
    weekday: 'short',
    month: 'short',
    day: 'numeric',
    year: 'numeric',
    timeZone: 'UTC',
  }).format(new Date(`${date}T12:00:00Z`));
}
const coreNutrients = [
  ['energy_kcal', 'Calories', 'kcal'],
  ['protein', 'Protein', 'g'],
  ['carbohydrate', 'Carbohydrate', 'g'],
  ['total_fat', 'Fat', 'g'],
] as const;
export function NutritionDashboard(props: NutritionDashboardProps) {
  const router = useRouter();
  const { activeProfile: profile, summary } = props;
  const today = props.today ?? summary.trend.at(-1)?.date ?? '';
  const zone = profile.dailyResetTimezone ?? 'UTC';
  const [diaryDate, setDiaryDate] = useState(props.initialDiaryDate ?? today);
  const [showHistory, setShowHistory] = useState(false);
  const [showOlder, setShowOlder] = useState(false);
  const [recordOpen, setRecordOpen] = useState(Boolean(props.initialLogMode));
  const [recordMode, setRecordMode] = useState<NutritionRecordMode>(
    props.initialLogMode ?? 'choose',
  );
  const [recordSelection, setRecordSelection] = useState('');
  const recoveryFocusRef = useRef<HTMLElement | null>(null);
  const [profileOpen, setProfileOpen] = useState(false);
  const [goalsOpen, setGoalsOpen] = useState(Boolean(props.initialGoalsOpen));
  const [status, setStatus] = useState('');
  const [openTool, setOpenTool] = useState('');
  const [dataOpen, setDataOpen] = useState(Boolean(props.initialTask));
  const [portionsOpen, setPortionsOpen] = useState(Boolean(props.initialOpenPortions));
  const request = useNutritionRequest(`${profile.id}:recommendations`);
  const workspace = props.dataWorkspace ?? { products: [], recipes: [] };
  const projection = props.mealProjection ?? {
    range: { start: today, end: today },
    meals: [],
    totalsByDate: {},
  };
  const showPlanned = profile.showPlannedNutrition ?? true;
  const consumed = summary.currentEntries.filter(
    (entry) => entry.state === 'eaten' || entry.state === 'corrected',
  );
  const consumedToday = consumed.filter(
    (entry) => nutritionLocalDateKey(new Date(entry.occurredAt), zone) === today,
  );
  const entries = summary.currentEntries.filter(
    (entry) =>
      nutritionLocalDateKey(new Date(entry.occurredAt), zone) === diaryDate &&
      (showHistory || entry.state !== 'deleted'),
  );
  const dayFood = entries.filter((entry) => entry.state === 'eaten' || entry.state === 'corrected');
  const goals = props.goals.map((goal) => ({
    ...goal,
    kind: goal.kind as ChartGoal['kind'],
    startsOn: goal.startsOn ?? today,
    endsOn: goal.endsOn ?? null,
  }));
  const hasGoals = goals.some(
    (goal) =>
      goal.state === 'active' && goal.startsOn <= today && (!goal.endsOn || goal.endsOn >= today),
  );
  const personalPortions = projection.meals.some((meal) =>
    meal.ownAllocations.some(
      (allocation) => allocation.servings != null && allocation.servings > 0,
    ),
  );
  const plannedToday = projection.totalsByDate[today] ?? {};
  const recent = [...summary.currentEntries]
    .sort((a, b) => b.occurredAt.localeCompare(a.occurredAt))
    .slice(0, 4);
  const units = profile.measurementSystem === 'imperial';
  const savedDirection =
    props.goalSetup?.nutritionGoalType && props.goalSetup.nutritionGoalType !== 'none'
      ? `Saved weight direction: ${props.goalSetup.nutritionGoalType}${props.goalSetup.currentWeightKilograms != null ? ` · ${displayNutritionWeight(props.goalSetup.currentWeightKilograms, units)}` : ''}${props.goalSetup.targetWeightKilograms != null ? ` to ${displayNutritionWeight(props.goalSetup.targetWeightKilograms, units)}` : ''}. Separate from daily nutrient goals.`
      : null;
  useEffect(() => {
    if (props.initialDiaryDate) Promise.resolve().then(() => setDiaryDate(props.initialDiaryDate!));
  }, [props.initialDiaryDate]);
  useEffect(() => {
    let active = true;
    Promise.resolve().then(() => {
      if (!active) return;
      if (props.initialLogMode) {
        setRecordMode(props.initialLogMode);
        setRecordOpen(true);
      } else if (props.initialTask || props.initialOpenPortions) {
        recoveryFocusRef.current =
          document
            .getElementById(props.initialOpenPortions ? 'planned-portions' : 'nutrition-data-tools')
            ?.querySelector<HTMLElement>('summary') ?? null;
        setRecordOpen(false);
        if (props.initialTask) setDataOpen(true);
        if (props.initialOpenPortions) setPortionsOpen(true);
        window.requestAnimationFrame(() => {
          if (!active) return;
          const root = document.getElementById(
            props.initialOpenPortions ? 'planned-portions' : 'nutrition-data-tools',
          );
          const summary = root?.querySelector<HTMLElement>('summary');
          summary?.focus({ preventScroll: true });
          summary?.scrollIntoView({ block: 'start' });
        });
      }
    });
    return () => {
      active = false;
    };
  }, [props.initialTask, props.initialRecipeId, props.initialOpenPortions, props.initialLogMode]);
  function selectDate(value: string) {
    if (!isNutritionDate(value) || value > today) return;
    setDiaryDate(value);
    setShowOlder(false);
    router.replace(`/nutrition?view=diary&date=${value}`, { scroll: false });
  }
  function shiftDate(amount: number) {
    const next = new Date(`${diaryDate}T12:00:00Z`);
    next.setUTCDate(next.getUTCDate() + amount);
    selectDate(next.toISOString().slice(0, 10));
  }
  function openRecord(mode: NutritionRecordMode = 'choose', selection = '') {
    recoveryFocusRef.current = null;
    setRecordSelection(selection);
    setRecordMode(mode);
    setRecordOpen(true);
  }
  function toolToggle(tool: string, open: boolean) {
    setOpenTool((current) => (open ? tool : current === tool ? '' : current));
    if (open)
      window.requestAnimationFrame(() => {
        const root = document.getElementById(`diary-${tool}`);
        root?.scrollIntoView({ block: 'nearest' });
        root?.querySelector<HTMLElement>('input,select,button')?.focus({ preventScroll: true });
      });
  }
  const dateControls = (
    <div className={styles.diaryDateNav} aria-label="Diary date navigation">
      <button type="button" aria-label="Previous diary day" onClick={() => shiftDate(-1)}>
        <ChevronLeft size={20} />
      </button>
      <label>
        <span className="sr-only">Diary date</span>
        <input
          type="date"
          value={diaryDate}
          max={today}
          onChange={(event) => selectDate(event.target.value)}
        />
      </label>
      <button
        type="button"
        aria-label="Next diary day"
        disabled={diaryDate >= today}
        onClick={() => shiftDate(1)}
      >
        <ChevronRight size={20} />
      </button>
      <button type="button" disabled={diaryDate === today} onClick={() => selectDate(today)}>
        Today
      </button>
    </div>
  );
  async function feedback(recommendation: Recommendation, state: string) {
    const task = `recommendation:${recommendation.key}`;
    const result = await request.send(
      task,
      `/api/v1/nutrition/profiles/${profile.id}/recommendations/${recommendation.key}/feedback`,
      { state, reason: '', supersedesFeedbackId: recommendation.feedback?.id ?? null },
    );
    if (result) {
      request.message(task, 'success', 'Assessment saved. No meal was scheduled or recorded.');
      router.refresh();
    }
  }
  async function addShortage(
    event: FormEvent<HTMLFormElement>,
    recommendation: Recommendation,
    index: number,
  ) {
    event.preventDefault();
    const item = recommendation.shortages[index];
    const listId = new FormData(event.currentTarget).get('listId');
    if (!item || !listId) return;
    const task = `recommendation:${recommendation.key}`;
    const result = await request.send(task, `/api/v1/shopping-lists/${listId}/items`, {
      quantity: item.quantity,
      unit: item.unit,
      item: item.productName,
      note: `Confirmed from ${recommendation.recipeTitle} Nutrition recommendation.`,
      aisleId: '',
      checked: false,
      productId: item.productId,
      recipeId: recommendation.recipeId,
      recommendationKey: recommendation.key,
    });
    if (result) {
      request.message(
        task,
        'success',
        'Confirmed shortage added to the selected list. No Pantry stock changed.',
      );
      router.refresh();
    }
  }
  const recordProps = {
    profile,
    profiles: props.profiles,
    date: props.view === 'diary' ? diaryDate : today,
    today,
    definitions: props.definitions,
    workspace,
    onSaved: (message: string) => setStatus(message),
  };
  const optionalSetup = (
    <details className={styles.optionalSetup}>
      <summary className="recipe-disclosure-summary">
        Optional goals and preferences
        <ChevronDown size={18} />
      </summary>
      <NutritionSetupOverview
        profileName={profile.displayName}
        hasConfiguredGoals={hasGoals}
        canManageGoals={profile.canManageGoals}
        canManageProfile={profile.canManageProfile}
        hasDiaryEntries={consumed.length > 0}
        hasPlannedMeals={personalPortions}
        savedGoalDescription={savedDirection}
        weightTrend={props.weightTrend}
        onRecordNutrition={() => openRecord()}
        onRecordWeight={() => openRecord('weight')}
        onConfigureGoals={() => setGoalsOpen(true)}
      />
    </details>
  );
  return (
    <main className={styles.page}>
      <PageHeader
        title={`${profile.displayName}’s nutrition`}
        description={
          props.view === 'overview'
            ? 'Recorded food, daily totals and personal portions.'
            : VIEW_EXPLAINERS[props.view]
        }
        actions={
          <div className={styles.headerButtons}>
            <button
              type="button"
              className={styles.primaryAction}
              disabled={!profile.canManageProfile}
              onClick={() => openRecord()}
            >
              <Plus size={18} />
              Log food
            </button>
            {props.view !== 'diary' ? (
              <Link className={styles.secondaryButton} href={`/nutrition?view=diary&date=${today}`}>
                View diary
              </Link>
            ) : null}
          </div>
        }
        toolbarLeft={
          <div className={styles.nutritionControls}>
            <label>
              View
              <select
                aria-label="Nutrition view"
                value={props.view}
                onChange={(event) => router.push(`/nutrition?view=${event.target.value}`)}
              >
                {VIEWS.map((view) => (
                  <option key={view} value={view}>
                    {VIEW_LABELS[view]}
                  </option>
                ))}
              </select>
            </label>
            <button
              type="button"
              className={styles.profileDetails}
              onClick={() => setProfileOpen(true)}
              aria-haspopup="dialog"
            >
              <UserCircle size={18} />
              {profile.displayName} · profile details
            </button>
            {props.view === 'diary' ? (
              dateControls
            ) : (
              <Link className={styles.dateLink} href={`/nutrition?view=diary&date=${today}`}>
                Open today’s diary · {readableDate(today)}
              </Link>
            )}
          </div>
        }
      />
      {status && <ToastNotice>{status}</ToastNotice>}
      {!profile.canManageProfile && (
        <p className={styles.helper}>
          This Nutrition profile is read only. You can view permitted records; recording and changes
          are unavailable.
        </p>
      )}
      {props.view === 'overview' && (
        <div className={styles.overviewColumns}>
          <div className={styles.overviewMain}>
            <section className={styles.panel} aria-labelledby="daily-intake-heading">
              <header className={styles.sectionHeading}>
                <div>
                  <h2 id="daily-intake-heading">Today’s recorded food</h2>
                  <p>
                    {profile.displayName} · {readableDate(today)}
                  </p>
                </div>
                {profile.canManageGoals && (
                  <button className="text-button" type="button" onClick={() => setGoalsOpen(true)}>
                    Edit goals
                  </button>
                )}
              </header>
              {consumedToday.length === 0 ? (
                <div className={styles.emptyState}>
                  <h3>No food recorded today</h3>
                  <p>
                    Log food to see known amounts. Skipped records and planned meals do not add
                    nutrients; a goal is optional.
                  </p>
                  <button
                    className="secondary-button"
                    type="button"
                    disabled={!profile.canManageProfile}
                    onClick={() => openRecord()}
                  >
                    <Plus size={18} aria-hidden="true" />
                    Log food
                  </button>
                </div>
              ) : (
                <div className={styles.dailyMetrics}>
                  {coreNutrients.map(([code, label, unit]) => {
                    const amount = summary.todayTotals[code];
                    const comparison = nutritionGoalComparison(goals, today, code, amount ?? null);
                    const known = consumedToday.filter((entry) =>
                      entry.values.some((value) => value.nutrientCode === code),
                    ).length;
                    return (
                      <article key={code}>
                        <div className={styles.metricLabel}>
                          <NutritionVisualMarker nutrientCode={code} compact />
                          <h3>{label}</h3>
                        </div>
                        <strong className={styles.metricValue}>
                          {number(amount, code === 'energy_kcal' ? 0 : 1)} <small>{unit}</small>
                        </strong>
                        <span>
                          {known} of {consumedToday.length} recorded foods have data
                        </span>
                        <p>{comparison.description}</p>
                        {comparison.visualPercent !== null &&
                        comparison.goal &&
                        (comparison.goal.kind === 'target' ||
                          comparison.goal.kind === 'minimum') ? (
                          <progress
                            value={comparison.visualPercent}
                            max={100}
                            aria-label={`${label} relative to configured ${comparison.goal.kind}`}
                          />
                        ) : null}
                      </article>
                    );
                  })}
                </div>
              )}
              <details className={styles.exactData}>
                <summary className="recipe-disclosure-summary">
                  View exact nutrition data
                  <ChevronDown size={18} />
                </summary>
                <NutritionChartPanels
                  datasets={{
                    ...props.chartDatasets,
                    calorie: { ...props.chartDatasets.calorie, showPlannedNutrition: showPlanned },
                  }}
                  mode="overview"
                  nutrientLabels={Object.fromEntries(
                    props.definitions.map((item) => [item.code, item.displayName]),
                  )}
                />
              </details>
            </section>
            <section className={styles.panel}>
              <header className={styles.sectionHeading}>
                <h2>Recent diary history</h2>
                <Link className="inline-link" href={`/nutrition?view=diary&date=${today}`}>
                  View diary
                </Link>
              </header>
              {recent.length ? (
                <ol className={styles.recentEntries}>
                  {recent.map((entry) => {
                    const date = nutritionLocalDateKey(new Date(entry.occurredAt), zone);
                    const confirmed = entry.state === 'eaten' || entry.state === 'corrected';
                    return (
                      <li key={entry.id}>
                        <Link href={`/nutrition?view=diary&date=${date}`}>
                          <strong>
                            {entry.sourceNameSnapshot || `${entry.mealSlot} ${entry.state}`}
                          </strong>
                          <span>
                            {entry.state} · {nutritionPortion(entry)} · {readableDate(date)}
                          </span>
                          <small>
                            {confirmed
                              ? entry.values.find((value) => value.nutrientCode === 'energy_kcal')
                                ? `${number(entry.values.find((value) => value.nutrientCode === 'energy_kcal')!.amount, 0)} kcal`
                                : 'Calories unknown'
                              : 'Not counted as consumed food'}
                          </small>
                        </Link>
                      </li>
                    );
                  })}
                </ol>
              ) : (
                <p className={styles.helper}>No diary history yet.</p>
              )}
            </section>
            <section className={styles.panel} id="planned-portions">
              <header className={styles.sectionHeading}>
                <div>
                  <h2>Upcoming meals and personal portions</h2>
                  <p>
                    {profile.displayName} · {readableDate(projection.range.start)} –{' '}
                    {readableDate(projection.range.end)}
                  </p>
                </div>
                <Link className="inline-link" href="/planner">
                  View full plan
                </Link>
              </header>
              {showPlanned &&
              Object.values(projection.totalsByDate).some((day) =>
                Object.values(day).some(Number.isFinite),
              ) ? (
                <>
                  <h3>Today’s planned estimates · {readableDate(today)}</h3>
                  <p className={styles.helper}>
                    Separate from consumed food. Averages below use only dates with a known value
                    for each nutrient.
                  </p>
                  <div className={styles.plannedMetrics}>
                    {coreNutrients.map(([code, label, unit]) => {
                      const average = nutritionKnownAverage(projection.totalsByDate, code);
                      return (
                        <div key={code}>
                          <strong>{label}</strong>
                          <span>
                            Today: {number(plannedToday[code])} {unit}
                          </span>
                          <small>
                            {average.days
                              ? `${number(average.value)} ${unit} average · ${average.days} ${average.days === 1 ? 'day' : 'days'} with data`
                              : 'No known values in this range'}
                          </small>
                        </div>
                      );
                    })}
                  </div>
                </>
              ) : showPlanned ? (
                <p className={styles.helper}>
                  No personal planned nutrition is available in this range. Assign a portion and
                  review recipe nutrition below.
                </p>
              ) : (
                <p className={styles.helper}>
                  Planned nutrient previews are hidden by this profile’s preference. Portion
                  management remains available.
                </p>
              )}
              <details
                open={portionsOpen}
                onToggle={(event) => setPortionsOpen(event.currentTarget.open)}
              >
                <summary className="recipe-disclosure-summary">
                  Manage planned portions
                  <ChevronDown size={18} />
                </summary>
                <NutritionMealPlanning
                  activeProfileId={profile.id}
                  activeProfileName={profile.displayName}
                  canManageProfile={profile.canManageProfile}
                  today={today}
                  consumedToday={summary.todayTotals}
                  projection={projection}
                  showNutritionPreview={false}
                  embedded
                />
              </details>
            </section>
            <section className={`${styles.panel} ${styles.recipeIdeas}`}>
              <h2>Recipe ideas and contextual review</h2>
              <p className={styles.helper}>
                Uses permitted goal, recorded-food and explicit-plan evidence. Ideas do not schedule
                meals or record consumption.
              </p>
              {(props.recommendations ?? []).length ? (
                <ol>
                  {(props.recommendations ?? []).map((recommendation) => (
                    <li key={recommendation.key}>
                      <h3>
                        <Link href={`/recipes/${recommendation.recipeId}`}>
                          {recommendation.recipeTitle}
                        </Link>
                      </h3>
                      <p>{recommendation.explanation}</p>
                      <details>
                        <summary className="recipe-disclosure-summary">
                          Evidence and actions
                          <ChevronDown size={18} />
                        </summary>
                        <p>
                          {recommendation.kind === 'planned_gap'
                            ? 'Planned gap'
                            : 'Recorded-average gap'}{' '}
                          · {recommendation.completeness * 100}% completeness. Pantry availability
                          is not consumption.
                        </p>
                        {recommendation.shortages.map((item, index) => (
                          <form
                            key={`${item.productId}:${item.unit}`}
                            onSubmit={(event) => void addShortage(event, recommendation, index)}
                          >
                            <p>
                              Confirmed shortage: {item.quantity} {item.unit} {item.productName}
                            </p>
                            {props.shoppingLists?.length ? (
                              <>
                                <label>
                                  Grocery list
                                  <select name="listId">
                                    {props.shoppingLists.map((list) => (
                                      <option key={list.id} value={list.id}>
                                        {list.name}
                                      </option>
                                    ))}
                                  </select>
                                </label>
                                <button type="submit" disabled={request.pending}>
                                  Confirm one grocery item
                                </button>
                              </>
                            ) : (
                              <Link href="/lists">Create a grocery list</Link>
                            )}
                          </form>
                        ))}
                        <div className={styles.buttonRow}>
                          {(['helpful', 'not_helpful', 'dismissed'] as const).map((state) => (
                            <button
                              key={state}
                              type="button"
                              disabled={request.pending}
                              onClick={() => void feedback(recommendation, state)}
                            >
                              {state === 'helpful'
                                ? 'Helpful'
                                : state === 'not_helpful'
                                  ? 'Not helpful'
                                  : 'Dismiss this evidence version'}
                            </button>
                          ))}
                        </div>
                        <NutritionFeedback
                          value={request.feedback[`recommendation:${recommendation.key}`]}
                        />
                      </details>
                    </li>
                  ))}
                </ol>
              ) : (
                <p className={styles.helper}>No recipe recommendation has enough evidence yet.</p>
              )}
              <DecisionAssistance
                headingLevel={3}
                embedded
                initialTask="insights"
                tasks={['insights']}
                title="Review nutrition insights"
                description="Review evidence-supported suggestions. Remembering an assessment does not log food or schedule a meal."
              />
            </section>
            {summary.currentEntries.length ||
            props.goals.length ||
            (props.weightTrend?.observations.length ?? 0) > 0 ? (
              <details className={styles.panel}>
                <summary className="recipe-disclosure-summary">
                  Saved nutrition insights
                  <ChevronDown size={18} />
                </summary>
                <NutritionInsights key={profile.id} initialSummary={props.initialAiSummary} />
              </details>
            ) : null}
            {optionalSetup}
            <details className={styles.panel}>
              <summary className="recipe-disclosure-summary">
                How totals and coverage are counted
                <ChevronDown size={18} />
              </summary>
              <p>
                Only the latest eaten or corrected food contributes. Planned, served, skipped,
                deleted and Pantry records are separate. A partial known sum does not describe
                unknown nutrients. Coverage and confidence describe recorded data, not health.
              </p>
              <Link className="inline-link" href="/nutrition?view=trends">
                View recorded trends
              </Link>
            </details>
          </div>
          <aside className={styles.overviewRail}>
            <section className={styles.panel}>
              <h2>Recording coverage</h2>
              <p className={styles.helper}>
                {profile.displayName} · {readableDate(today)}
              </p>
              {consumedToday.length ? (
                <dl className={styles.coverageList}>
                  <div>
                    <dt>Average nutrient-data completeness</dt>
                    <dd>
                      {summary.averageCompleteness === null
                        ? 'Unknown'
                        : `${Math.round(summary.averageCompleteness * 100)}%`}
                    </dd>
                  </div>
                  <div>
                    <dt>Average source confidence</dt>
                    <dd>
                      {summary.averageConfidence === null
                        ? 'Unknown'
                        : `${Math.round(summary.averageConfidence * 100)}%`}
                    </dd>
                  </div>
                </dl>
              ) : (
                <p className={styles.helper}>
                  No consumed food recorded for this day; coverage is unavailable.
                </p>
              )}
              {summary.hasEstimatedValues && <p className={styles.helper}>Includes estimates.</p>}
              <Link className="inline-link" href="/nutrition?view=nutrients">
                View nutrient details
              </Link>
            </section>
            {profile.canViewMeasurements && (
              <NutritionScaleSettings
                key={profile.id}
                profileId={profile.id}
                latest={props.latestWeighIn ?? null}
                imperial={units}
                enabled={Boolean(profile.weightTrackingEnabled)}
                canManage={profile.canManageProfile}
                onRecord={() => openRecord('weight')}
              />
            )}
            <section className={styles.panel}>
              <h2>Household profiles</h2>
              <p>
                {props.householdComparison.members.length} authorised{' '}
                {props.householdComparison.members.length === 1 ? 'profile' : 'profiles'} in this
                comparison.
              </p>
              <p className={styles.helper}>
                Activity period: {props.householdComparison.range.start} –{' '}
                {props.householdComparison.range.end}. Personal recording coverage above is not a
                household average.
              </p>
              <Link className="inline-link" href="/nutrition?view=household">
                View permitted household activity
              </Link>
            </section>
          </aside>
        </div>
      )}
      {props.view === 'diary' && (
        <div className={styles.stack}>
          <section className={styles.panel}>
            <header className={styles.sectionHeading}>
              <h2>Food diary · {readableDate(diaryDate)}</h2>
              <Link className="inline-link" href="/account/nutrition">
                Diary settings
              </Link>
            </header>
            {dayFood.length > 0 && (
              <div className={styles.diaryDayTotals} aria-label="Selected day nutrition totals">
                {coreNutrients.map(([code, label, unit]) => {
                  const values = dayFood.flatMap((entry) =>
                    entry.values.filter((value) => value.nutrientCode === code),
                  );
                  return (
                    <div key={code}>
                      <span>{label}</span>
                      <strong>
                        {values.length
                          ? number(
                              values.reduce((sum, value) => sum + value.amount, 0),
                              code === 'energy_kcal' ? 0 : 1,
                            )
                          : '—'}{' '}
                        {unit}
                      </strong>
                      <small>
                        {values.length} of {dayFood.length} foods have data
                      </small>
                    </div>
                  );
                })}
              </div>
            )}
            <label className={styles.checkRow}>
              <input
                type="checkbox"
                checked={showHistory}
                onChange={(event) => setShowHistory(event.target.checked)}
              />
              Show deleted entries
            </label>
            {!entries.length ? (
              <div className={styles.emptyState}>
                <h3>No food logged for this day</h3>
                <p>
                  Record food or copy eligible entries from another day. Unknown values are not
                  measured zero.
                </p>
                <button
                  className="secondary-button"
                  type="button"
                  disabled={!profile.canManageProfile}
                  onClick={() => openRecord()}
                >
                  <Plus size={18} aria-hidden="true" />
                  Log food
                </button>
              </div>
            ) : (
              <ol className={styles.diaryList}>
                {entries.slice(0, showOlder ? undefined : 10).map((entry) => (
                  <NutritionDiaryEntry
                    key={`${profile.id}:${entry.id}`}
                    entry={entry}
                    profile={profile}
                    profiles={props.profiles}
                    definitions={props.definitions}
                    today={today}
                    onSaved={setStatus}
                  />
                ))}
              </ol>
            )}
            {entries.length > 10 && (
              <button type="button" onClick={() => setShowOlder((value) => !value)}>
                {showOlder ? 'Show recent entries' : 'Show all entries for this day'}
              </button>
            )}
          </section>
          <section className={styles.panel}>
            <h2>Diary tools</h2>
            <p className={styles.helper}>
              Tools use {profile.displayName}’s selected diary day. Copying appends records; a
              skipped meal adds history without nutrients.
            </p>
            {profile.canExportData && (
              <details>
                <summary className="recipe-disclosure-summary">
                  Export nutrition data (JSON)
                  <ChevronDown size={18} />
                </summary>
                <p className={styles.helper}>
                  Exports this profile’s permitted nutrition data, including more than the visible
                  diary day.
                </p>
                <a
                  className="inline-link"
                  href={`/api/v1/nutrition/profiles/${profile.id}/export`}
                  download
                >
                  Download nutrition data (JSON)
                </a>
              </details>
            )}
            {(['skipped', 'copy'] as const).map((tool) => (
              <details
                key={tool}
                id={`diary-${tool}`}
                open={openTool === tool}
                onToggle={(event) => toolToggle(tool, event.currentTarget.open)}
                className={styles.toolDisclosure}
              >
                <summary className="recipe-disclosure-summary">
                  {tool === 'copy' ? 'Copy a diary day' : 'Record a skipped meal'}
                  <ChevronDown size={18} />
                </summary>
                <NutritionRecordForm
                  key={`${profile.id}:${tool}:${diaryDate}`}
                  {...recordProps}
                  mode={tool}
                  inline
                />
              </details>
            ))}
          </section>
          <details
            className={styles.panel}
            id="nutrition-data-tools"
            open={dataOpen}
            onToggle={(event) => setDataOpen(event.currentTarget.open)}
          >
            <summary className="recipe-disclosure-summary">
              Add food or maintain nutrition data
              <ChevronDown size={18} />
            </summary>
            <NutritionDataWorkspace
              key={`${profile.id}:${props.initialTask ?? ''}:${props.initialRecipeId ?? ''}`}
              workspace={workspace}
              definitions={props.definitions}
              activeProfileId={profile.id}
              canManageProfile={profile.canManageProfile}
              initialTask={props.initialTask}
              initialRecipeId={props.initialRecipeId}
              onLog={(mode, id) => openRecord(mode, id)}
            />
            {props.returnLogMode && (
              <button
                type="button"
                onClick={() => openRecord(props.returnLogMode === 'recipe' ? 'recipe' : 'product')}
              >
                Return to food logging
              </button>
            )}
          </details>
          <details className={styles.panel} id="prepared-servings">
            <summary className="recipe-disclosure-summary">
              Manage prepared servings and leftovers
              <ChevronDown size={18} />
            </summary>
            <NutritionPreparedWorkspace
              key={profile.id}
              activeProfileId={profile.id}
              activeProfileName={profile.displayName}
              canManageProfile={profile.canManageProfile}
              workspace={props.preparedWorkspace ?? []}
              date={diaryDate}
              today={today}
              timeZone={zone}
              onLog={() => openRecord('recipe')}
            />
          </details>
        </div>
      )}
      {props.view === 'nutrients' && (
        <div className={styles.stack}>
          <section className={styles.panel}>
            <h2>Today’s known nutrient amounts</h2>
            <p className={styles.helper}>
              {profile.displayName} · {readableDate(today)}. Missing nutrients are unknown.
            </p>
            {Object.keys(summary.todayTotals).length ? (
              <dl className={styles.nutrientGrid}>
                {props.definitions
                  .filter((item) => summary.todayTotals[item.code] !== undefined)
                  .map((item) => (
                    <div key={item.code}>
                      <dt>{item.displayName}</dt>
                      <dd>
                        {number(summary.todayTotals[item.code], 2)} {item.canonicalUnit}
                      </dd>
                    </div>
                  ))}
              </dl>
            ) : (
              <p>No consumed nutrient values recorded today.</p>
            )}
          </section>
          <NutritionChartPanels
            datasets={props.chartDatasets}
            mode="nutrients"
            nutrientLabels={Object.fromEntries(
              props.definitions.map((item) => [item.code, item.displayName]),
            )}
          />
        </div>
      )}
      {props.view === 'trends' && (
        <div className={styles.stack}>
          {props.advancedCharts ? (
            <NutritionAdvancedChartPanels
              charts={props.advancedCharts}
              nutrientLabels={Object.fromEntries(
                props.definitions.map((item) => [item.code, item.displayName]),
              )}
              nutrientUnits={Object.fromEntries(
                props.definitions.map((item) => [item.code, item.canonicalUnit]),
              )}
            />
          ) : (
            <section className={styles.panel}>
              <h2>Recorded nutrition trends</h2>
              <p>More diary data is needed for food trends.</p>
            </section>
          )}
          <NutritionWeightTrendPanel trend={props.weightTrend} />
          {profile.canViewMeasurements && (
            <NutritionScaleSettings
              key={profile.id}
              profileId={profile.id}
              latest={props.latestWeighIn ?? null}
              imperial={units}
              enabled={Boolean(profile.weightTrackingEnabled)}
              canManage={profile.canManageProfile}
              onRecord={() => openRecord('weight')}
            />
          )}
        </div>
      )}
      {props.view === 'household' && (
        <NutritionHouseholdWorkspace
          profiles={props.profiles}
          comparison={props.householdComparison}
        />
      )}
      {profileOpen && (
        <AppDialog
          className={styles.recordDialog}
          aria-labelledby="nutrition-profile-dialog-title"
          onClose={() => setProfileOpen(false)}
        >
          <header className={styles.dialogHeader}>
            <h2 id="nutrition-profile-dialog-title">{profile.displayName} · profile details</h2>
            <button
              type="button"
              className={styles.iconButton}
              aria-label="Close person details"
              onClick={() => setProfileOpen(false)}
            >
              <X size={20} />
            </button>
          </header>
          <div className={styles.dialogBody}>
            <p>
              Records, goals and permissions belong to the active household profile. Use the app
              header’s profile switcher to change person.
            </p>
            <p>
              <Link className="inline-link" href="/account/nutrition">
                Nutrition settings
              </Link>
            </p>
            <p>
              <Link className="inline-link" href="/settings/profiles">
                Household profile administration
              </Link>
            </p>
          </div>
        </AppDialog>
      )}
      <NutritionRecordingDialog
        key={`${profile.id}:${recordSelection}`}
        {...recordProps}
        open={recordOpen}
        mode={recordMode}
        onMode={setRecordMode}
        onClose={() => setRecordOpen(false)}
        selectedId={recordSelection}
        returnFocusRef={recoveryFocusRef}
      />
      <NutritionGoalDialog
        key={profile.id}
        open={goalsOpen}
        onClose={() => setGoalsOpen(false)}
        profile={profile}
        definitions={props.definitions}
        goals={props.goals}
        goalSetup={props.goalSetup}
        today={today}
        onSaved={setStatus}
      />
      <footer className={styles.disclaimer}>
        Nutrition records support meal planning and self-management. Estimates are not medical
        diagnosis or treatment. The app header selects the active household profile.
      </footer>
    </main>
  );
}
