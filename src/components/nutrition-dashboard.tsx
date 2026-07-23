'use client';

import {
  ArrowRight,
  CalendarDays,
  ChefHat,
  ChevronDown,
  Info,
  NotebookTabs,
  Plus,
  TrendingUp,
  UserCircle,
  Utensils,
} from 'lucide-react';
import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { useRef, useState, type CSSProperties, type FormEvent } from 'react';

import styles from '@/components/nutrition-dashboard.module.css';
import {
  NutritionAdvancedChartPanels,
  NutritionWeightTrendPanel,
} from '@/components/nutrition-advanced-chart-panels';
import { NutritionChartPanels } from '@/components/nutrition-chart-panels';
import { NutritionDataWorkspace } from '@/components/nutrition-data-workspace';
import { NutritionHouseholdWorkspace } from '@/components/nutrition-household-workspace';
import { NutritionVisualMarker } from '@/components/nutrition-visual-marker';
import {
  NutritionMealPlanning,
  type NutritionMealProjectionView,
} from '@/components/nutrition-meal-planning';
import {
  NutritionPreparedWorkspace,
  type PreparedServingWorkspace,
} from '@/components/nutrition-prepared-workspace';
import type { NutritionChartDatasets } from '@/lib/domain/nutrition-chart-datasets';
import type { AdvancedNutritionCharts } from '@/lib/domain/nutrition-advanced-charts';
import type { NutritionWeightTrend } from '@/lib/domain/nutrition-weight-trend';

const VIEWS = ['overview', 'diary', 'nutrients', 'trends', 'household', 'goals'] as const;
export type NutritionView = (typeof VIEWS)[number];
type ProfileSummary = {
  id: string;
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
  trendRangeDays?: 7 | 14 | 30;
  showPlannedNutrition?: boolean;
};
type DiaryEntry = {
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
type NutrientDefinition = {
  code: string;
  displayName: string;
  canonicalUnit: string;
  category: string;
};
type Goal = {
  id: string;
  nutrientCode: string;
  kind: string;
  value: number | null;
  minimum: number | null;
  maximum: number | null;
  unit: string;
  sourceType: string;
  state: string;
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
  principalId: string;
  profiles: ProfileSummary[];
  activeProfile: ProfileSummary;
  view: NutritionView;
  summary: DashboardSummary;
  definitions: NutrientDefinition[];
  goals: Goal[];
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
  dataWorkspace?: Parameters<typeof NutritionDataWorkspace>[0]['workspace'];
  preparedWorkspace?: PreparedServingWorkspace;
};

function number(value: number | undefined, digits = 0) {
  return value === undefined
    ? '—'
    : value.toLocaleString(undefined, { maximumFractionDigits: digits });
}

function percent(value: number | null) {
  return value === null ? 'Unknown' : `${Math.round(value * 100)}%`;
}

function goalValue(goal: Goal) {
  if (goal.kind === 'range') return `${goal.minimum}–${goal.maximum} ${goal.unit}`;
  if (goal.kind === 'limit') return `At most ${goal.maximum} ${goal.unit}`;
  return `${goal.value} ${goal.unit}`;
}

function goalBoundary(goal: Goal | undefined): number | null {
  if (!goal) return null;
  if (goal.kind === 'range' || goal.kind === 'limit') return goal.maximum;
  return goal.value;
}

function progressPercent(value: number | null | undefined, target: number | null) {
  if (value === null || value === undefined || !target) return 0;
  return Math.min(100, Math.max(0, (value / target) * 100));
}

function coverageLabel(value: number | null) {
  if (value === null) return 'Unknown';
  if (value >= 0.8) return 'Good';
  if (value >= 0.5) return 'Partial';
  return 'Limited';
}

function dateRangeLabel(start: string, end: string) {
  const format = (value: string) =>
    new Intl.DateTimeFormat(undefined, { month: 'short', day: 'numeric' }).format(
      new Date(`${value}T12:00:00`),
    );
  return `${format(start)} – ${format(end)}, ${end.slice(0, 4)}`;
}

function entryCalories(entry: DiaryEntry) {
  return entry.values.find((value) => value.nutrientCode === 'energy_kcal')?.amount;
}

async function errorMessage(response: Response) {
  try {
    return (
      ((await response.json()) as { error?: { message?: string } }).error?.message ??
      'The change failed.'
    );
  } catch {
    return 'The change failed.';
  }
}

export function NutritionDashboard(props: NutritionDashboardProps) {
  const router = useRouter();
  const [status, setStatus] = useState('');
  const [showOlderDiary, setShowOlderDiary] = useState(false);
  const retryKeys = useRef(new Map<string, string>());
  const { activeProfile, summary } = props;
  const definition = new Map(props.definitions.map((item) => [item.code, item]));
  const today = props.today ?? summary.trend.at(-1)?.date ?? '';
  const mealProjection = props.mealProjection ?? {
    range: { start: today, end: today },
    meals: [],
    totalsByDate: {},
  };
  const plannedToday = mealProjection.totalsByDate[today] ?? {};
  const trendRangeDays = activeProfile.trendRangeDays ?? summary.trend.length;
  const showPlannedNutrition = activeProfile.showPlannedNutrition ?? true;
  const currentGoals = new Map(
    props.goals.filter((goal) => goal.state === 'active').map((goal) => [goal.nutrientCode, goal]),
  );
  const calorieGoal = goalBoundary(currentGoals.get('energy_kcal'));
  const caloriesConsumed = summary.todayTotals.energy_kcal;
  const caloriesPlanned = plannedToday.energy_kcal;
  const caloriesRemaining =
    calorieGoal === null || caloriesConsumed === undefined ? null : calorieGoal - caloriesConsumed;
  const calorieProgress = progressPercent(caloriesConsumed, calorieGoal);
  const macroCodes = ['protein', 'carbohydrate', 'total_fat'] as const;
  const macroLabels = { protein: 'Protein', carbohydrate: 'Carbohydrate', total_fat: 'Fat' };
  const macroColors = {
    protein: 'var(--nutrition-protein)',
    carbohydrate: 'var(--nutrition-carbohydrate)',
    total_fat: 'var(--nutrition-fat)',
    alcohol: 'var(--nutrition-other)',
  } as const;
  let macroOffset = 0;
  const macroGradient =
    props.chartDatasets.macroComposition.status === 'ready'
      ? `conic-gradient(${props.chartDatasets.macroComposition.items
          .map((item) => {
            const start = macroOffset;
            macroOffset += item.visualPercent;
            return `${macroColors[item.code as keyof typeof macroColors] ?? 'var(--muted)'} ${start}% ${macroOffset}%`;
          })
          .join(', ')})`
      : 'conic-gradient(var(--line) 0 100%)';
  const plannedDates = Object.values(mealProjection.totalsByDate);
  const plannedAverage = (code: string) =>
    plannedDates.length
      ? plannedDates.reduce((total, values) => total + (values[code] ?? 0), 0) / plannedDates.length
      : undefined;
  const recentEntries = [...summary.currentEntries]
    .sort((left, right) => right.occurredAt.localeCompare(left.occurredAt))
    .slice(0, 4);
  const qualityScore =
    summary.averageCompleteness === null && summary.averageConfidence === null
      ? null
      : Math.round(
          (((summary.averageCompleteness ?? 0) + (summary.averageConfidence ?? 0)) / 2) * 100,
        );
  const trendMaximum = Math.max(1, ...summary.trend.map((day) => day.energyKcal ?? 0));

  async function mutate(url: string, body: unknown) {
    setStatus('Saving…');
    const response = await fetch(url, {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify(body),
    });
    if (!response.ok) {
      setStatus(await errorMessage(response));
      return false;
    }
    setStatus('Saved.');
    router.refresh();
    return true;
  }

  async function recommendationFeedback(
    recommendation: Recommendation,
    state: 'dismissed' | 'helpful' | 'not_helpful',
  ) {
    await mutate(
      `/api/v1/nutrition/profiles/${activeProfile.id}/recommendations/${recommendation.key}/feedback`,
      {
        state,
        reason: '',
        supersedesFeedbackId: recommendation.feedback?.id ?? null,
      },
    );
  }

  async function addRecommendationShortage(
    event: FormEvent<HTMLFormElement>,
    recommendation: Recommendation,
    shortageIndex: number,
  ) {
    event.preventDefault();
    const data = new FormData(event.currentTarget);
    const listId = String(data.get('listId') ?? '');
    const shortage = recommendation.shortages[shortageIndex];
    if (!listId || !shortage) return;
    setStatus('Adding the confirmed shortage to the grocery list…');
    const response = await fetch(`/api/v1/shopping-lists/${listId}/items`, {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({
        quantity: shortage.quantity,
        unit: shortage.unit,
        item: shortage.productName,
        note: `Confirmed from ${recommendation.recipeTitle} Nutrition recommendation.`,
        aisleId: '',
        checked: false,
        productId: shortage.productId,
        recipeId: recommendation.recipeId,
        recommendationKey: recommendation.key,
      }),
    });
    if (!response.ok) {
      setStatus(await errorMessage(response));
      return;
    }
    setStatus('Confirmed shortage added to the selected grocery list. Pantry was not changed.');
  }

  async function addGoal(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const form = event.currentTarget;
    const data = new FormData(form);
    const nutrientCode = String(data.get('nutrientCode'));
    const nutrient = definition.get(nutrientCode);
    const kind = String(data.get('kind'));
    const numeric = Number(data.get('value'));
    const goal = {
      nutrientCode,
      unit: nutrient?.canonicalUnit ?? '',
      sourceType: 'user_defined',
      startsOn: today,
      kind,
      ...(kind === 'limit' ? { maximum: numeric } : { value: numeric }),
    };
    if (await mutate(`/api/v1/nutrition/profiles/${activeProfile.id}/goals`, { goal })) {
      form.reset();
    }
  }

  async function recordSkipped(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const form = event.currentTarget;
    const data = new FormData(form);
    if (
      await mutate(`/api/v1/nutrition/profiles/${activeProfile.id}/intake`, {
        occurredAt: new Date(String(data.get('occurredAt'))).toISOString(),
        mealSlot: data.get('mealSlot'),
        state: 'skipped',
        sourceType: 'manual',
      })
    ) {
      form.reset();
    }
  }

  async function correctDiaryEntry(event: FormEvent<HTMLFormElement>, entry: DiaryEntry) {
    event.preventDefault();
    const data = new FormData(event.currentTarget);
    const common = {
      occurredAt: entry.occurredAt,
      mealSlot: entry.mealSlot,
      supersedesIntakeRevisionId: entry.id,
      revisionReason: data.get('revisionReason'),
    };
    if (entry.sourceType === 'recipe' && entry.recipeCalculationId) {
      await mutate(`/api/v1/nutrition/profiles/${activeProfile.id}/intake/recipe`, {
        ...common,
        recipeCalculationId: entry.recipeCalculationId,
        servingCount: Number(data.get('portion')),
      });
      return;
    }
    if (entry.sourceType === 'product' && entry.productId) {
      await mutate(`/api/v1/nutrition/profiles/${activeProfile.id}/intake/product`, {
        ...common,
        productId: entry.productId,
        quantity: Number(data.get('portion')),
        unit: data.get('unit'),
      });
      return;
    }
    await mutate(`/api/v1/nutrition/profiles/${activeProfile.id}/intake/manual`, {
      ...common,
      sourceName: entry.sourceNameSnapshot,
      quantity: Number(data.get('portion')),
      unit: data.get('unit'),
      values: entry.values.map((value) => ({
        nutrientCode: value.nutrientCode,
        amount: Number(data.get(`value-${value.nutrientCode}`)),
      })),
    });
  }

  async function deleteDiaryEntry(event: FormEvent<HTMLFormElement>, entry: DiaryEntry) {
    event.preventDefault();
    const data = new FormData(event.currentTarget);
    await mutate(`/api/v1/nutrition/profiles/${activeProfile.id}/intake/${entry.id}/delete`, {
      reason: data.get('reason'),
    });
  }

  function retryKey(scope: string) {
    const existing = retryKeys.current.get(scope);
    if (existing) return existing;
    const created = crypto.randomUUID();
    retryKeys.current.set(scope, created);
    return created;
  }

  async function runDiaryCommand(
    scope: string,
    command: Record<string, unknown>,
    form?: HTMLFormElement,
  ) {
    const completed = await mutate(
      `/api/v1/nutrition/profiles/${activeProfile.id}/diary-commands`,
      { ...command, idempotencyKey: retryKey(scope) },
    );
    if (completed) {
      retryKeys.current.delete(scope);
      form?.reset();
    }
  }

  async function copyDiaryDay(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const form = event.currentTarget;
    const data = new FormData(form);
    await runDiaryCommand(
      `copy-day:${String(data.get('sourceDate'))}:${String(data.get('targetDate'))}:${String(data.get('targetProfileId'))}`,
      {
        command: 'copy_day',
        sourceDate: data.get('sourceDate'),
        targetDate: data.get('targetDate'),
        targetProfileId: data.get('targetProfileId'),
      },
      form,
    );
  }

  async function entryLifecycleCommand(
    event: FormEvent<HTMLFormElement>,
    entry: DiaryEntry,
    command: 'copy_entry' | 'move' | 'restore' | 'reassign',
  ) {
    event.preventDefault();
    const form = event.currentTarget;
    const data = new FormData(form);
    const occurred = data.get('occurredAt');
    const body: Record<string, unknown> = {
      command,
      sourceRevisionId: entry.id,
    };
    if (occurred) body.occurredAt = new Date(String(occurred)).toISOString();
    if (data.get('mealSlot')) body.mealSlot = data.get('mealSlot');
    if (data.get('targetProfileId')) body.targetProfileId = data.get('targetProfileId');
    if (data.get('reason')) body.reason = data.get('reason');
    await runDiaryCommand(`${command}:${entry.id}`, body, form);
  }

  const recommendationEvidence = (props.recommendations ?? []).length ? (
    <details className={styles.recommendationDisclosure}>
      <summary>View recommendation evidence</summary>
      <p>
        Pantry means available, not eaten. Recommendations use recorded or explicitly planned gaps
        and keep every shortage confirmation separate.
      </p>
      <ol className={styles.recommendationList}>
        {(props.recommendations ?? []).map((recommendation) => (
          <li key={recommendation.key}>
            <header>
              <div>
                <span>
                  {recommendation.kind === 'planned_gap' ? 'Planned gap' : 'Recorded-average gap'} ·{' '}
                  {definition.get(recommendation.nutrientCode)?.displayName ??
                    recommendation.nutrientCode}
                </span>
                <h3>
                  <Link href={`/recipes/${recommendation.recipeId}`}>
                    {recommendation.recipeTitle}
                  </Link>
                </h3>
              </div>
              <strong>{Math.round(recommendation.gapCoveragePercent)}% of this gap</strong>
            </header>
            <p>{recommendation.explanation}</p>
            {recommendation.shortages.length ? (
              <div className={styles.shortageList}>
                <strong>Exact missing ingredients</strong>
                {recommendation.shortages.map((shortage, index) => (
                  <form
                    key={`${shortage.productId}:${shortage.unit}`}
                    onSubmit={(event) =>
                      void addRecommendationShortage(event, recommendation, index)
                    }
                  >
                    <span>
                      {shortage.quantity} {shortage.unit} {shortage.productName}
                    </span>
                    {(props.shoppingLists ?? []).length ? (
                      <>
                        <label>
                          Grocery list
                          <select name="listId" required>
                            {(props.shoppingLists ?? []).map((list) => (
                              <option key={list.id} value={list.id}>
                                {list.name}
                              </option>
                            ))}
                          </select>
                        </label>
                        <button type="submit">Confirm one grocery item</button>
                      </>
                    ) : (
                      <Link href="/lists">Create a grocery list first</Link>
                    )}
                  </form>
                ))}
              </div>
            ) : null}
            <div className={styles.feedbackActions} aria-label="Recommendation feedback">
              <button
                type="button"
                onClick={() => void recommendationFeedback(recommendation, 'helpful')}
              >
                Helpful
              </button>
              <button
                type="button"
                onClick={() => void recommendationFeedback(recommendation, 'not_helpful')}
              >
                Not helpful
              </button>
              <button
                type="button"
                onClick={() => void recommendationFeedback(recommendation, 'dismissed')}
              >
                Dismiss this evidence version
              </button>
            </div>
          </li>
        ))}
      </ol>
    </details>
  ) : null;

  const redesignedOverview = (
    <div className={styles.overview}>
      <section className={styles.metricGrid} aria-label="Today's nutrition summary">
        <article className={styles.metric}>
          <div className={styles.metricLabel}>
            <NutritionVisualMarker nutrientCode="energy_kcal" />
            <span>Calories consumed</span>
          </div>
          <p className={styles.metricValue}>
            <strong>{number(caloriesConsumed)}</strong> <span>kcal</span>
          </p>
          <small>{calorieGoal ? `${Math.round(calorieProgress)}% of goal` : 'No daily goal'}</small>
        </article>
        <article className={styles.metric}>
          <div className={styles.metricLabel}>
            <NutritionVisualMarker nutrientCode="protein" />
            <span>Protein</span>
          </div>
          <p className={styles.metricValue}>
            <strong>{number(summary.todayTotals.protein, 1)}</strong> <span>g</span>
          </p>
          <small>
            {goalBoundary(currentGoals.get('protein'))
              ? `${Math.round(progressPercent(summary.todayTotals.protein, goalBoundary(currentGoals.get('protein'))))}% of goal`
              : 'Confirmed today'}
          </small>
        </article>
        {showPlannedNutrition ? (
          <article className={styles.metric}>
            <div className={styles.metricLabel}>
              <NutritionVisualMarker nutrientCode="energy_kcal" />
              <span>Calories planned</span>
            </div>
            <p className={styles.metricValue}>
              <strong>{number(caloriesPlanned)}</strong> <span>kcal</span>
            </p>
            <small>Daily plan · not consumed</small>
          </article>
        ) : null}
        <article className={`${styles.metric} ${styles.macroMetric}`}>
          <div className={styles.metricLabel}>
            <NutritionVisualMarker nutrientCode="carbohydrate" />
            <span>Macro balance</span>
          </div>
          <div className={styles.macroSummary}>
            <ul>
              {props.chartDatasets.macroComposition.status === 'ready' ? (
                props.chartDatasets.macroComposition.items.slice(0, 3).map((item) => (
                  <li key={item.code}>
                    <i style={{ background: macroColors[item.code as keyof typeof macroColors] }} />
                    <span>{macroLabels[item.code as keyof typeof macroLabels] ?? item.code}</span>
                    <strong>{item.percentOfCalculatedEnergy.toFixed(0)}%</strong>
                  </li>
                ))
              ) : (
                <li>Needs complete macros</li>
              )}
            </ul>
            <span
              className={styles.macroDonut}
              style={{ background: macroGradient }}
              role="img"
              aria-label="Confirmed macro composition"
            />
          </div>
        </article>
        <article className={styles.metric}>
          <div className={styles.metricLabel}>
            <NutritionVisualMarker nutrientCode="other" />
            <span>Data coverage</span>
          </div>
          <p className={styles.metricValue}>
            <strong>{coverageLabel(summary.averageCompleteness)}</strong>
          </p>
          <small>
            {summary.hasEstimatedValues ? 'Includes estimates' : 'Verified as recorded'}
          </small>
        </article>
      </section>

      <div className={styles.overviewColumns}>
        <div className={styles.overviewMain}>
          <section className={`${styles.panel} ${styles.glancePanel}`}>
            <header className={styles.overviewHeading}>
              <h2>Today at a glance</h2>
              <p>Progress towards your daily nutrition goals.</p>
            </header>
            <div className={styles.glanceBody}>
              <div
                className={styles.calorieRing}
                style={{ '--progress': `${calorieProgress}%` } as CSSProperties}
                role="img"
                aria-label={`${Math.round(calorieProgress)}% of configured calorie goal`}
              >
                <span>
                  <strong>{number(caloriesConsumed)}</strong>
                  <small>kcal</small>
                  <b>{calorieGoal ? `${Math.round(calorieProgress)}% of goal` : 'No goal'}</b>
                </span>
              </div>
              <div className={styles.progressWorkspace}>
                <div className={styles.calorieFigures}>
                  <span>
                    Consumed
                    <strong>
                      {number(caloriesConsumed)} <small>kcal</small>
                    </strong>
                  </span>
                  <span>
                    Planned
                    <strong>
                      {number(caloriesPlanned)} <small>kcal</small>
                    </strong>
                  </span>
                  <span className={styles.remainingFigure}>
                    Remaining
                    <strong>
                      {caloriesRemaining === null ? '—' : number(caloriesRemaining)}{' '}
                      <small>kcal</small>
                    </strong>
                  </span>
                </div>
                <div className={styles.goalTrack} aria-hidden="true">
                  <span style={{ width: `${calorieProgress}%` }} />
                  {calorieGoal ? <i /> : null}
                </div>
                <div className={styles.goalScale}>
                  <span>0 kcal</span>
                  <span>
                    {calorieGoal ? `${number(calorieGoal)} kcal goal` : 'No goal configured'}
                  </span>
                </div>
                <p className={styles.macroProgressTitle}>Macro progress</p>
                <div className={styles.macroProgress}>
                  {macroCodes.map((code) => {
                    const amount = summary.todayTotals[code];
                    const target = goalBoundary(currentGoals.get(code));
                    const progress = progressPercent(amount, target);
                    return (
                      <article key={code}>
                        <span>{macroLabels[code]}</span>
                        <strong>
                          {number(amount, 1)} / {target ? number(target, 1) : '—'} g
                        </strong>
                        <div aria-hidden="true">
                          <i style={{ width: `${progress}%` }} />
                        </div>
                        <small>{target ? `${Math.round(progress)}%` : 'No goal'}</small>
                      </article>
                    );
                  })}
                </div>
              </div>
            </div>
            <footer className={styles.goalSummary}>
              <strong>Goal summary</strong>
              {(['energy_kcal', ...macroCodes] as const).map((code) => (
                <span key={code}>
                  {code === 'energy_kcal' ? 'Daily calorie goal' : `${macroLabels[code]} goal`}
                  <b>
                    {goalBoundary(currentGoals.get(code))
                      ? `${number(goalBoundary(currentGoals.get(code))!)} ${code === 'energy_kcal' ? 'kcal' : 'g'}`
                      : 'Not set'}
                  </b>
                </span>
              ))}
              <Link href="/settings/nutrition">Edit goals</Link>
            </footer>
            <details className={styles.exactData}>
              <summary>View exact nutrition data</summary>
              <NutritionChartPanels
                datasets={props.chartDatasets}
                mode="overview"
                nutrientLabels={Object.fromEntries(
                  props.definitions.map((item) => [item.code, item.displayName]),
                )}
              />
            </details>
          </section>

          <section className={`${styles.panel} ${styles.plannedPanel}`}>
            <header className={styles.panelHeadingRow}>
              <div>
                <h2>Planned nutrition and portions</h2>
                <p>
                  Planned meals and targets for{' '}
                  {dateRangeLabel(mealProjection.range.start, mealProjection.range.end)}. Portions
                  are explicit and may be fractional.
                </p>
              </div>
              <Link href="/planner">
                View full plan <ArrowRight size={15} />
              </Link>
            </header>
            <div className={styles.plannedMetrics}>
              {(['energy_kcal', ...macroCodes] as const).map((code) => {
                const unit = code === 'energy_kcal' ? 'kcal' : 'g';
                return (
                  <article key={code}>
                    <NutritionVisualMarker nutrientCode={code} compact />
                    <div>
                      <strong>{code === 'energy_kcal' ? 'Calories' : macroLabels[code]}</strong>
                      <span>
                        Planned{' '}
                        <b>
                          {number(plannedToday[code], 1)} {unit} / day
                        </b>
                      </span>
                      <span>
                        Weekly avg{' '}
                        <b>
                          {number(plannedAverage(code), 1)} {unit}
                        </b>
                      </span>
                    </div>
                  </article>
                );
              })}
            </div>
            <details className={styles.planDisclosure}>
              <summary>Manage planned portions</summary>
              <NutritionMealPlanning
                activeProfileId={activeProfile.id}
                canManageProfile={activeProfile.canManageProfile}
                today={today}
                consumedToday={summary.todayTotals}
                projection={mealProjection}
              />
            </details>
          </section>
        </div>

        <aside className={styles.overviewRail}>
          <section className={`${styles.panel} ${styles.recentPanel}`}>
            <header className={styles.railHeading}>
              <h2>Recent entries</h2>
              <Link href="/nutrition?view=diary">View diary</Link>
            </header>
            {recentEntries.length ? (
              <ol className={styles.recentEntries}>
                {recentEntries.map((entry) => (
                  <li key={entry.id}>
                    <span className={styles.entryIcon}>
                      <Utensils size={15} />
                    </span>
                    <span>
                      <strong>
                        {entry.mealSlot || 'Entry'} · {entry.sourceNameSnapshot}
                      </strong>
                      <small>{new Date(entry.occurredAt).toLocaleString()}</small>
                    </span>
                    <b>
                      {entryCalories(entry) === undefined
                        ? '—'
                        : `${number(entryCalories(entry))} kcal`}
                    </b>
                  </li>
                ))}
              </ol>
            ) : (
              <p className={styles.compactEmpty}>No confirmed entries yet.</p>
            )}
            <Link className={styles.railLink} href="/nutrition?view=diary">
              View full diary <ArrowRight size={14} />
            </Link>
          </section>

          <section className={`${styles.panel} ${styles.qualityPanel}`}>
            <h2>Data quality</h2>
            <div>
              <span
                className={styles.qualityRing}
                style={{ '--progress': `${qualityScore ?? 0}%` } as CSSProperties}
                role="img"
                aria-label={
                  qualityScore === null
                    ? 'Data quality unknown'
                    : `${qualityScore} out of 100 data quality`
                }
              >
                <strong>{qualityScore ?? '—'}</strong>
                <small>/100</small>
              </span>
              <span>
                <strong>{coverageLabel(summary.averageCompleteness)}</strong>
                <p>Recording quality based on completeness and confidence, not a health score.</p>
              </span>
            </div>
            <Link href="/nutrition?view=nutrients">
              See coverage details <ArrowRight size={14} />
            </Link>
          </section>

          <section className={`${styles.panel} ${styles.householdSnapshot}`}>
            <header>
              <h2>Household snapshot</h2>
              <span>This week</span>
            </header>
            <div>
              <span className={styles.avatarStack} aria-hidden="true">
                {(props.householdComparison.members.length
                  ? props.householdComparison.members
                  : [{ key: activeProfile.id, label: activeProfile.displayName }]
                )
                  .slice(0, 3)
                  .map((member) => (
                    <i key={member.key}>{member.label.slice(0, 1).toUpperCase()}</i>
                  ))}
              </span>
              <p>
                <strong>{props.householdComparison.members.length || 1} members tracked</strong>
                <span>{percent(summary.averageCompleteness)} avg. data coverage</span>
              </p>
            </div>
          </section>
        </aside>
      </div>

      <div className={styles.contextGrid}>
        <section className={`${styles.panel} ${styles.contextPanel}`}>
          <h2>
            <Info size={18} /> What this view knows
          </h2>
          <p>
            Totals use the latest revision of food explicitly recorded as eaten. Planned meals,
            Pantry stock, cooked recipes, served portions, skipped meals, and deleted diary rows are
            not consumption.
          </p>
          {summary.currentEntries.length === 0 ? (
            <p className={styles.compactEmpty}>
              No confirmed diary entries yet. Nothing is assumed.
            </p>
          ) : null}
          <Link href="/nutrition?view=diary">
            Learn more <ArrowRight size={14} />
          </Link>
        </section>

        <section className={`${styles.panel} ${styles.contextPanel}`}>
          <h2>
            <TrendingUp size={18} /> Patterns, with context
          </h2>
          <p>{props.insights.qualityMessage}</p>
          <div
            className={styles.trendPreview}
            role="img"
            aria-label="Recent confirmed calorie trend"
          >
            {summary.trend.map((day) => (
              <span key={day.date}>
                <i
                  className={day.energyKcal === null ? styles.missingTrend : ''}
                  style={{
                    height: `${Math.max(8, ((day.energyKcal ?? 0) / trendMaximum) * 100)}%`,
                  }}
                />
                <small>
                  {new Intl.DateTimeFormat(undefined, { weekday: 'short' }).format(
                    new Date(`${day.date}T12:00:00`),
                  )}
                </small>
              </span>
            ))}
          </div>
          {props.insights.suggestions.length ? (
            <strong>{props.insights.suggestions[0]!.message}</strong>
          ) : (
            <span className={styles.muted}>More recorded days are needed for a pattern.</span>
          )}
        </section>

        <section
          className={`${styles.panel} ${styles.contextPanel}`}
          aria-labelledby="nutrition-recommendations-heading-redesign"
        >
          <h2 id="nutrition-recommendations-heading-redesign">
            <ChefHat size={18} /> Recipe ideas from recorded evidence
          </h2>
          <p>These ideas appear when there is enough goal, diary, or explicit plan evidence.</p>
          {(props.recommendations ?? []).length ? (
            <div className={styles.recipeIdeas}>
              {(props.recommendations ?? []).slice(0, 3).map((recommendation) => (
                <Link href={`/recipes/${recommendation.recipeId}`} key={recommendation.key}>
                  <span>
                    <ChefHat size={18} />
                  </span>
                  <small>
                    {recommendation.kind === 'planned_gap' ? 'Planned gap' : 'Recorded gap'}
                  </small>
                  <strong>{recommendation.recipeTitle}</strong>
                </Link>
              ))}
            </div>
          ) : (
            <p className={styles.compactEmpty}>No recipe recommendation has enough evidence yet.</p>
          )}
          {recommendationEvidence}
        </section>
      </div>
    </div>
  );

  return (
    <main className={styles.page}>
      <header className={styles.dashboardHeader}>
        <div>
          <p className={styles.eyebrow}>Your Nutrition</p>
          <h1>{activeProfile.displayName}&apos;s nutrition</h1>
          <p className={styles.muted}>
            Confirmed food, planned portions, and Pantry availability stay separate.
          </p>
        </div>
        <div className={styles.headerTools}>
          <div className={styles.headerSelectors}>
            <details className={styles.profileSelector}>
              <summary>
                <UserCircle size={18} aria-hidden="true" />
                {activeProfile.displayName}
                <ChevronDown size={15} aria-hidden="true" />
              </summary>
              <p>Switch people from the household profile control in the app header.</p>
            </details>
            <span className={styles.dateSelector}>
              <CalendarDays size={17} aria-hidden="true" />
              {dateRangeLabel(mealProjection.range.start, mealProjection.range.end)}
              <ChevronDown size={15} aria-hidden="true" />
            </span>
          </div>
          <div className={styles.headerButtons}>
            <Link className={styles.primaryAction} href="/nutrition?view=diary">
              <Plus size={17} aria-hidden="true" /> Log food
            </Link>
            <Link className={styles.secondaryButton} href="/nutrition?view=diary">
              <Plus size={17} aria-hidden="true" /> Add entry
            </Link>
            <Link className={styles.secondaryButton} href="/nutrition?view=diary">
              <NotebookTabs size={17} aria-hidden="true" /> View diary
            </Link>
          </div>
        </div>
      </header>

      <nav className={styles.tabs} aria-label="Nutrition views">
        {VIEWS.map((view) => (
          <Link
            key={view}
            href={`/nutrition?view=${view}`}
            aria-current={props.view === view ? 'page' : undefined}
          >
            {view === 'diary' ? 'Food Diary' : view[0]!.toUpperCase() + view.slice(1)}
          </Link>
        ))}
      </nav>

      {props.view === 'overview' ? (
        <>
          {redesignedOverview}
          {false ? (
            <div className={styles.stack}>
              <section className={styles.metricGrid} aria-label="Today's nutrition summary">
                <article className={styles.metric}>
                  <div className={styles.metricLabel}>
                    <NutritionVisualMarker nutrientCode="energy_kcal" />
                    <span>Calories consumed</span>
                  </div>
                  <strong>{number(summary.todayTotals.energy_kcal)}</strong>
                  <small>kcal confirmed today</small>
                </article>
                <article className={styles.metric}>
                  <div className={styles.metricLabel}>
                    <NutritionVisualMarker nutrientCode="protein" />
                    <span>Protein</span>
                  </div>
                  <strong>{number(summary.todayTotals.protein, 1)}</strong>
                  <small>g confirmed today</small>
                </article>
                {showPlannedNutrition ? (
                  <article className={styles.metric}>
                    <div className={styles.metricLabel}>
                      <NutritionVisualMarker nutrientCode="energy_kcal" />
                      <span>Calories planned</span>
                    </div>
                    <strong>{number(plannedToday.energy_kcal)}</strong>
                    <small>not counted as consumed</small>
                  </article>
                ) : null}
                <article className={styles.metric}>
                  <div className={styles.metricLabel}>
                    <NutritionVisualMarker nutrientCode="other" />
                    <span>Data coverage</span>
                  </div>
                  <strong>{percent(summary.averageCompleteness)}</strong>
                  <small>
                    {summary.hasEstimatedValues ? 'includes estimates' : 'verified as recorded'}
                  </small>
                </article>
              </section>
              <NutritionChartPanels
                datasets={props.chartDatasets}
                mode="overview"
                nutrientLabels={Object.fromEntries(
                  props.definitions.map((item) => [item.code, item.displayName]),
                )}
              />
              <NutritionMealPlanning
                activeProfileId={activeProfile.id}
                canManageProfile={activeProfile.canManageProfile}
                today={today}
                consumedToday={summary.todayTotals}
                projection={mealProjection}
              />
              <section className={styles.panel}>
                <h2>What this view knows</h2>
                <p>
                  Totals use the latest revision of food explicitly recorded as eaten. Planned
                  meals, Pantry stock, cooked recipes, served portions, skipped meals, and deleted
                  diary rows are not consumption.
                </p>
                {summary.currentEntries.length === 0 ? (
                  <p className={styles.callout}>
                    No confirmed diary entries yet. Nothing is assumed.
                  </p>
                ) : null}
              </section>
              <section className={styles.panel}>
                <h2>Patterns, with context</h2>
                <p className={styles.muted}>{props.insights.qualityMessage}</p>
                {props.insights.suggestions.length > 0 ? (
                  <ul className={styles.insightList}>
                    {props.insights.suggestions.map((suggestion) => (
                      <li key={suggestion.nutrientCode}>
                        <strong>
                          {definition.get(suggestion.nutrientCode)?.displayName ??
                            suggestion.nutrientCode}
                        </strong>
                        <span>{suggestion.message}</span>
                      </li>
                    ))}
                  </ul>
                ) : (
                  <p className={styles.callout}>
                    No food suggestion is shown until the diary has enough complete days.
                  </p>
                )}
              </section>
              <section className={styles.panel} aria-labelledby="nutrition-recommendations-heading">
                <h2 id="nutrition-recommendations-heading">Recipe ideas from recorded evidence</h2>
                <p className={styles.muted}>
                  These deterministic ideas appear only for sufficiently complete recurring or
                  explicitly planned gaps. Pantry means available, not eaten. Check suitability and
                  portions for yourself.
                </p>
                {(props.recommendations ?? []).length ? (
                  <ol className={styles.recommendationList}>
                    {(props.recommendations ?? []).map((recommendation) => (
                      <li key={recommendation.key}>
                        <header>
                          <div>
                            <span>
                              {recommendation.kind === 'planned_gap'
                                ? 'Planned gap'
                                : 'Recorded-average gap'}{' '}
                              ·{' '}
                              {definition.get(recommendation.nutrientCode)?.displayName ??
                                recommendation.nutrientCode}
                            </span>
                            <h3>
                              <Link href={`/recipes/${recommendation.recipeId}`}>
                                {recommendation.recipeTitle}
                              </Link>
                            </h3>
                          </div>
                          <strong>
                            {Math.round(recommendation.gapCoveragePercent)}% of this gap
                          </strong>
                        </header>
                        <p>{recommendation.explanation}</p>
                        <p className={styles.muted}>
                          Calculation: {Math.round(recommendation.completeness * 100)}% complete ·{' '}
                          {Math.round(recommendation.confidence * 100)}% confidence. Pantry:{' '}
                          {recommendation.pantryState}.
                        </p>
                        {recommendation.expiringProductNames.length ? (
                          <p>
                            Uses currently available products with a soon date:{' '}
                            {recommendation.expiringProductNames.join(', ')}. Date labels are
                            inventory information, not a food-safety determination.
                          </p>
                        ) : null}
                        {recommendation.pantryUnknownReasons.length ? (
                          <details>
                            <summary>Why some Pantry amounts are unknown</summary>
                            <ul>
                              {recommendation.pantryUnknownReasons.map((reason) => (
                                <li key={reason}>{reason}</li>
                              ))}
                            </ul>
                          </details>
                        ) : null}
                        {recommendation.shortages.length ? (
                          <div className={styles.shortageList}>
                            <strong>Exact missing ingredients</strong>
                            {recommendation.shortages.map((shortage, index) => (
                              <form
                                key={`${shortage.productId}:${shortage.unit}`}
                                onSubmit={(event) =>
                                  void addRecommendationShortage(event, recommendation, index)
                                }
                              >
                                <span>
                                  {shortage.quantity} {shortage.unit} {shortage.productName}
                                </span>
                                {(props.shoppingLists ?? []).length ? (
                                  <>
                                    <label>
                                      Grocery list
                                      <select name="listId" required>
                                        {(props.shoppingLists ?? []).map((list) => (
                                          <option key={list.id} value={list.id}>
                                            {list.name}
                                          </option>
                                        ))}
                                      </select>
                                    </label>
                                    <button type="submit">Confirm one grocery item</button>
                                  </>
                                ) : (
                                  <Link href="/lists">Create a grocery list first</Link>
                                )}
                              </form>
                            ))}
                          </div>
                        ) : null}
                        <div
                          className={styles.feedbackActions}
                          aria-label="Recommendation feedback"
                        >
                          <button
                            type="button"
                            onClick={() => void recommendationFeedback(recommendation, 'helpful')}
                          >
                            Helpful
                          </button>
                          <button
                            type="button"
                            onClick={() =>
                              void recommendationFeedback(recommendation, 'not_helpful')
                            }
                          >
                            Not helpful
                          </button>
                          <button
                            type="button"
                            onClick={() => void recommendationFeedback(recommendation, 'dismissed')}
                          >
                            Dismiss this evidence version
                          </button>
                        </div>
                      </li>
                    ))}
                  </ol>
                ) : (
                  <p className={styles.callout}>
                    No recipe recommendation has enough goal, diary, or explicit plan evidence.
                  </p>
                )}
              </section>
            </div>
          ) : null}
        </>
      ) : null}

      {props.view === 'diary' ? (
        <div className={styles.stack}>
          <div className={styles.twoColumn}>
            <section className={styles.panel}>
              <div className={styles.sectionHeading}>
                <div>
                  <h2>Current diary</h2>
                  <p className={styles.muted}>
                    Copies create new immutable series; moves, restores, and reassignments append
                    audited history.
                  </p>
                </div>
                {activeProfile.canExportData ? (
                  <a
                    className={styles.secondaryButton}
                    href={`/api/v1/nutrition/profiles/${activeProfile.id}/export`}
                    download
                  >
                    Export Nutrition JSON
                  </a>
                ) : null}
              </div>
              {summary.currentEntries.length === 0 ? (
                <p className={styles.muted}>No diary history is visible for this profile.</p>
              ) : (
                <ol className={styles.diaryList}>
                  {summary.currentEntries.slice(0, showOlderDiary ? undefined : 10).map((entry) => (
                    <li key={entry.id}>
                      <div>
                        <strong>{entry.sourceNameSnapshot || `${entry.mealSlot} skipped`}</strong>
                        <span>
                          {new Date(entry.occurredAt).toLocaleString()} · {entry.state} · revision{' '}
                          {entry.revision}
                        </span>
                      </div>
                      <b>
                        {number(
                          entry.values.find((item) => item.nutrientCode === 'energy_kcal')?.amount,
                        )}{' '}
                        kcal
                      </b>
                      {entry.state === 'eaten' || entry.state === 'corrected' ? (
                        <details>
                          <summary>Correct, copy, move, or reassign</summary>
                          <form
                            className={styles.form}
                            onSubmit={(event) => void correctDiaryEntry(event, entry)}
                          >
                            <label>
                              {entry.sourceType === 'recipe' ? 'Servings' : 'Portion amount'}
                              <input
                                name="portion"
                                type="number"
                                min="0.000001"
                                step="any"
                                defaultValue={entry.servingCount ?? entry.quantity ?? 1}
                                required
                              />
                            </label>
                            {entry.sourceType !== 'recipe' ? (
                              <label>
                                Portion unit
                                <input
                                  name="unit"
                                  defaultValue={entry.unit ?? 'portion'}
                                  required
                                />
                              </label>
                            ) : null}
                            {entry.sourceType === 'manual'
                              ? entry.values.map((value) => (
                                  <label key={value.nutrientCode}>
                                    {definition.get(value.nutrientCode)?.displayName ??
                                      value.nutrientCode}
                                    <input
                                      name={`value-${value.nutrientCode}`}
                                      type="number"
                                      min="0"
                                      step="any"
                                      defaultValue={value.amount}
                                      required
                                    />
                                  </label>
                                ))
                              : null}
                            <label>
                              Correction reason
                              <input name="revisionReason" maxLength={500} required />
                            </label>
                            <button type="submit" disabled={!activeProfile.canManageProfile}>
                              Save correction
                            </button>
                          </form>
                          <form
                            className={styles.form}
                            onSubmit={(event) =>
                              void entryLifecycleCommand(event, entry, 'copy_entry')
                            }
                          >
                            <h3>Copy entry</h3>
                            <label>
                              Copy to profile
                              <select name="targetProfileId" defaultValue={activeProfile.id}>
                                {props.profiles
                                  .filter((profile) => profile.canManageProfile)
                                  .map((profile) => (
                                    <option key={profile.id} value={profile.id}>
                                      {profile.displayName}
                                    </option>
                                  ))}
                              </select>
                            </label>
                            <label>
                              When
                              <input name="occurredAt" type="datetime-local" required />
                            </label>
                            <label>
                              Meal
                              <select name="mealSlot" defaultValue={entry.mealSlot}>
                                <option value="breakfast">Breakfast</option>
                                <option value="lunch">Lunch</option>
                                <option value="dinner">Dinner</option>
                                <option value="snack">Snack</option>
                                <option value="other">Other</option>
                              </select>
                            </label>
                            <button type="submit" disabled={!activeProfile.canManageProfile}>
                              Copy entry
                            </button>
                          </form>
                          <form
                            className={styles.form}
                            onSubmit={(event) => void entryLifecycleCommand(event, entry, 'move')}
                          >
                            <h3>Move entry</h3>
                            <label>
                              New time
                              <input name="occurredAt" type="datetime-local" required />
                            </label>
                            <label>
                              New meal
                              <select name="mealSlot" defaultValue={entry.mealSlot}>
                                <option value="breakfast">Breakfast</option>
                                <option value="lunch">Lunch</option>
                                <option value="dinner">Dinner</option>
                                <option value="snack">Snack</option>
                                <option value="other">Other</option>
                              </select>
                            </label>
                            <label>
                              Move reason
                              <input name="reason" maxLength={500} required />
                            </label>
                            <button type="submit" disabled={!activeProfile.canManageProfile}>
                              Move entry
                            </button>
                          </form>
                          {props.profiles.filter((profile) => profile.id !== activeProfile.id)
                            .length > 0 ? (
                            <form
                              className={styles.form}
                              onSubmit={(event) =>
                                void entryLifecycleCommand(event, entry, 'reassign')
                              }
                            >
                              <h3>Reassign entry</h3>
                              <label>
                                Move to profile
                                <select name="targetProfileId" required>
                                  {props.profiles
                                    .filter((profile) => profile.id !== activeProfile.id)
                                    .map((profile) => (
                                      <option key={profile.id} value={profile.id}>
                                        {profile.displayName}
                                      </option>
                                    ))}
                                </select>
                              </label>
                              <label>
                                When
                                <input name="occurredAt" type="datetime-local" required />
                              </label>
                              <label>
                                Meal
                                <select name="mealSlot" defaultValue={entry.mealSlot}>
                                  <option value="breakfast">Breakfast</option>
                                  <option value="lunch">Lunch</option>
                                  <option value="dinner">Dinner</option>
                                  <option value="snack">Snack</option>
                                  <option value="other">Other</option>
                                </select>
                              </label>
                              <label>
                                Reassignment reason
                                <input name="reason" maxLength={500} required />
                              </label>
                              <button type="submit" disabled={!activeProfile.canManageProfile}>
                                Reassign entry
                              </button>
                            </form>
                          ) : null}
                          <form
                            className={styles.form}
                            onSubmit={(event) => void deleteDiaryEntry(event, entry)}
                          >
                            <label>
                              Deletion reason
                              <input name="reason" maxLength={500} required />
                            </label>
                            <button type="submit" disabled={!activeProfile.canManageProfile}>
                              Delete from current totals
                            </button>
                          </form>
                        </details>
                      ) : entry.state === 'deleted' ? (
                        <form
                          className={styles.form}
                          onSubmit={(event) => void entryLifecycleCommand(event, entry, 'restore')}
                        >
                          <label>
                            Restore reason
                            <input name="reason" maxLength={500} required />
                          </label>
                          <button type="submit" disabled={!activeProfile.canManageProfile}>
                            Restore entry
                          </button>
                        </form>
                      ) : null}
                    </li>
                  ))}
                </ol>
              )}
              {summary.currentEntries.length > 10 ? (
                <button
                  className={styles.secondaryButton}
                  type="button"
                  onClick={() => setShowOlderDiary((current) => !current)}
                >
                  {showOlderDiary
                    ? 'Show newest 10'
                    : `Show ${summary.currentEntries.length - 10} older entries`}
                </button>
              ) : null}
            </section>
            <section className={styles.panel}>
              <h2>Diary tools</h2>
              <p className={styles.muted}>
                Record an exception or reuse a previous day when you need it.
              </p>
              <details className={styles.actionDisclosure}>
                <summary>Record a skipped meal</summary>
                <p className={styles.muted}>
                  This records history without adding nutrients. Confirmed portions are added by
                  their recipe and product flows.
                </p>
                <form className={styles.form} onSubmit={recordSkipped}>
                  <label>
                    When
                    <input name="occurredAt" type="datetime-local" required />
                  </label>
                  <label>
                    Meal
                    <select name="mealSlot" defaultValue="dinner">
                      <option value="breakfast">Breakfast</option>
                      <option value="lunch">Lunch</option>
                      <option value="dinner">Dinner</option>
                      <option value="snack">Snack</option>
                      <option value="other">Other</option>
                    </select>
                  </label>
                  <button className="primary-button" type="submit">
                    Record skipped meal
                  </button>
                </form>
              </details>
              <details className={styles.actionDisclosure}>
                <summary>Copy a diary day</summary>
                <p className={styles.muted}>
                  Copies confirmed entries only and preserves local meal times in the target
                  profile&apos;s timezone.
                </p>
                <form className={styles.form} onSubmit={copyDiaryDay}>
                  <label>
                    Source date
                    <input name="sourceDate" type="date" required />
                  </label>
                  <label>
                    Target date
                    <input name="targetDate" type="date" required />
                  </label>
                  <label>
                    Target profile
                    <select name="targetProfileId" defaultValue={activeProfile.id}>
                      {props.profiles
                        .filter((profile) => profile.canManageProfile)
                        .map((profile) => (
                          <option key={profile.id} value={profile.id}>
                            {profile.displayName}
                          </option>
                        ))}
                    </select>
                  </label>
                  <button type="submit" disabled={!activeProfile.canManageProfile}>
                    Copy day
                  </button>
                </form>
              </details>
            </section>
          </div>
          <details className={`${styles.panel} ${styles.actionDisclosure}`}>
            <summary>Add food or maintain nutrition data</summary>
            <NutritionDataWorkspace
              workspace={props.dataWorkspace ?? { products: [], recipes: [] }}
              definitions={props.definitions}
              activeProfileId={activeProfile.id}
              canManageProfile={activeProfile.canManageProfile}
            />
          </details>
          <details className={`${styles.panel} ${styles.actionDisclosure}`}>
            <summary>Manage prepared servings and leftovers</summary>
            <NutritionPreparedWorkspace
              activeProfileId={activeProfile.id}
              activeProfileName={activeProfile.displayName}
              canManageProfile={activeProfile.canManageProfile}
              workspace={props.preparedWorkspace ?? []}
            />
          </details>
        </div>
      ) : null}

      {props.view === 'nutrients' ? (
        <div className={styles.stack}>
          <section className={styles.panel}>
            <h2>Today&apos;s nutrients</h2>
            <p className={styles.muted}>
              Missing nutrients are unknown, not zero. Coverage reflects the records actually used.
            </p>
            <div className={styles.nutrientGrid}>
              {props.definitions
                .filter((item) => summary.todayTotals[item.code] !== undefined)
                .map((item) => (
                  <article key={item.code}>
                    <div className={styles.nutrientLabel}>
                      <NutritionVisualMarker
                        nutrientCode={item.code}
                        category={item.category}
                        label={item.displayName}
                        compact
                      />
                      <span>{item.displayName}</span>
                    </div>
                    <strong>
                      {number(summary.todayTotals[item.code], 2)} {item.canonicalUnit}
                    </strong>
                    <small>{item.category}</small>
                  </article>
                ))}
            </div>
            {Object.keys(summary.todayTotals).length === 0 ? (
              <p className={styles.callout}>No nutrient values have been confirmed today.</p>
            ) : null}
          </section>
          <NutritionChartPanels
            datasets={props.chartDatasets}
            mode="nutrients"
            nutrientLabels={Object.fromEntries(
              props.definitions.map((item) => [item.code, item.displayName]),
            )}
          />
        </div>
      ) : null}

      {props.view === 'trends' ? (
        <>
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
              <h2>{trendRangeDays}-day nutrition trends</h2>
              <p className={styles.callout}>Nutrition diary data is required for food trends.</p>
            </section>
          )}
          <NutritionWeightTrendPanel trend={props.weightTrend} />
        </>
      ) : null}

      {props.view === 'household' ? (
        <NutritionHouseholdWorkspace
          profiles={props.profiles}
          comparison={props.householdComparison}
        />
      ) : null}

      {props.view === 'goals' ? (
        <div className={styles.twoColumn}>
          <section className={styles.panel}>
            <h2>Current goal history</h2>
            {props.goals.length === 0 ? (
              <p className={styles.muted}>No goals configured.</p>
            ) : (
              <ul className={styles.goalList}>
                {props.goals.map((goal) => (
                  <li key={goal.id}>
                    <strong>
                      {definition.get(goal.nutrientCode)?.displayName ?? goal.nutrientCode}
                    </strong>
                    <span>
                      {goalValue(goal)} · {goal.sourceType} · {goal.state}
                    </span>
                  </li>
                ))}
              </ul>
            )}
          </section>
          <details className={`${styles.panel} ${styles.actionDisclosure}`}>
            <summary>Add a manual goal</summary>
            <p className={styles.muted}>
              Manual goals are versioned and are never overwritten by general references.
            </p>
            <form className={styles.form} onSubmit={addGoal}>
              <label>
                Nutrient
                <select name="nutrientCode" defaultValue="energy_kcal">
                  {props.definitions.map((item) => (
                    <option key={item.code} value={item.code}>
                      {item.displayName} ({item.canonicalUnit})
                    </option>
                  ))}
                </select>
              </label>
              <label>
                Goal type
                <select name="kind" defaultValue="target">
                  <option value="target">Target</option>
                  <option value="minimum">Minimum</option>
                  <option value="limit">Limit</option>
                </select>
              </label>
              <label>
                Value
                <input name="value" type="number" min="0.01" step="any" required />
              </label>
              <button className="primary-button" type="submit">
                Save goal
              </button>
            </form>
          </details>
        </div>
      ) : null}

      <p className={styles.status} role="status" aria-live="polite">
        {status}
      </p>
      <footer className={styles.disclaimer}>
        Nutrition information is for meal planning and self-management, not medical diagnosis or
        treatment. General references are not personalized clinical advice. Nutrition follows the
        active household profile selected in the app header.
      </footer>
    </main>
  );
}
