'use client';

import {
  ArrowRight,
  CalendarDays,
  ChefHat,
  ClipboardCopy,
  ChevronDown,
  CircleSlash2,
  Info,
  NotebookTabs,
  Plus,
  Scale,
  Search,
  TrendingUp,
  UserCircle,
  Utensils,
  X,
} from 'lucide-react';
import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { useEffect, useRef, useState, type CSSProperties, type FormEvent } from 'react';

import { AiSummaryCards, type AiSummaryCardData } from '@/components/ai-summary-cards';
import {
  NutritionAdvancedChartPanels,
  NutritionWeightTrendPanel,
} from '@/components/nutrition-advanced-chart-panels';
import styles from '@/components/nutrition-dashboard.module.css';
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
import {
  NutritionSetupOverview,
  NutritionWeightTrackerCard,
} from '@/components/nutrition-setup-overview';
import { createClientUuid } from '@/lib/client/client-uuid';
import type { NutritionChartDatasets } from '@/lib/domain/nutrition-chart-datasets';
import type { AdvancedNutritionCharts } from '@/lib/domain/nutrition-advanced-charts';
import type { NutritionWeightTrend } from '@/lib/domain/nutrition-weight-trend';

const VIEWS = ['overview', 'diary', 'nutrients', 'trends', 'household'] as const;
const POUNDS_PER_KILOGRAM = 2.2046226218;
export type NutritionView = (typeof VIEWS)[number];
type LogMode = 'choose' | 'product' | 'recipe' | 'manual' | 'skipped' | 'copy' | 'weight';

const VIEW_LABELS: Record<NutritionView, string> = {
  overview: 'Overview',
  diary: 'Food Diary',
  nutrients: 'Nutrients',
  trends: 'Trends',
  household: 'Household',
};

const VIEW_EXPLAINERS: Record<NutritionView, string> = {
  overview:
    'A daily summary of confirmed intake, planned portions, goals, and the quality of the available data.',
  diary:
    'A factual history of food marked as eaten. Corrections preserve the earlier record instead of rewriting it.',
  nutrients: 'Confirmed nutrient amounts and coverage. A missing value means unknown, never zero.',
  trends:
    'Patterns across recorded days. Trends appear only when enough comparable diary data exists.',
  household:
    'Separate, privacy-aware views of each person’s recorded intake and assigned meal portions.',
};
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
  measurementSystem?: 'metric' | 'imperial';
  trendRangeDays?: 7 | 14 | 30;
  showPlannedNutrition?: boolean;
  weightTrackingEnabled?: boolean;
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
type NutritionGoalSetup = {
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
  dataWorkspace?: Parameters<typeof NutritionDataWorkspace>[0]['workspace'];
  preparedWorkspace?: PreparedServingWorkspace;
  initialAiSummary?: AiSummaryCardData | null;
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
  const [saving, setSaving] = useState(false);
  const [showOlderDiary, setShowOlderDiary] = useState(false);
  const [logDialogOpen, setLogDialogOpen] = useState(false);
  const [logMode, setLogMode] = useState<LogMode>('choose');
  const [viewDialogOpen, setViewDialogOpen] = useState(false);
  const [profileDialogOpen, setProfileDialogOpen] = useState(false);
  const [goalSetupDialogOpen, setGoalSetupDialogOpen] = useState(false);
  const [weightPlanPal, setWeightPlanPal] = useState('low_active');
  const [weightPlanPace, setWeightPlanPace] = useState<'gradual' | 'steady'>('gradual');
  const [maintenanceEstimate, setMaintenanceEstimate] = useState<number | null>(null);
  const [estimatingPlan, setEstimatingPlan] = useState(false);
  const logDialogRef = useRef<HTMLDialogElement>(null);
  const viewDialogRef = useRef<HTMLDialogElement>(null);
  const profileDialogRef = useRef<HTMLDialogElement>(null);
  const goalSetupDialogRef = useRef<HTMLDialogElement>(null);
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
  const hasConfiguredGoals = currentGoals.size > 0;
  const savedWeightGoal = props.goalSetup;
  const canPlanFromWeightGoal =
    savedWeightGoal?.nutritionGoalType === 'loss' || savedWeightGoal?.nutritionGoalType === 'gain';
  const paceAdjustment = weightPlanPace === 'steady' ? 500 : 250;
  const guidedCalorieTarget =
    maintenanceEstimate === null || !canPlanFromWeightGoal
      ? null
      : savedWeightGoal.nutritionGoalType === 'loss'
        ? maintenanceEstimate - paceAdjustment
        : maintenanceEstimate + paceAdjustment;
  const guidedTargetIsTooLow = guidedCalorieTarget !== null && guidedCalorieTarget < 1200;
  const savedGoalDescription =
    savedWeightGoal?.nutritionGoalType === 'loss' || savedWeightGoal?.nutritionGoalType === 'gain'
      ? savedWeightGoal.currentWeightKilograms !== null &&
        savedWeightGoal.targetWeightKilograms !== null
        ? `Saved ${savedWeightGoal.nutritionGoalType} target: ${savedWeightGoal.currentWeightKilograms.toFixed(1)} kg to ${savedWeightGoal.targetWeightKilograms.toFixed(1)} kg${savedWeightGoal.targetDate ? ` by ${savedWeightGoal.targetDate}` : ''}.`
        : `Saved body-weight direction: ${savedWeightGoal.nutritionGoalType}.`
      : savedWeightGoal?.nutritionGoalType === 'maintain'
        ? 'Saved body-weight direction: maintain.'
        : null;
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
  const dataWorkspace = props.dataWorkspace ?? { products: [], recipes: [] };
  const loggableProducts = dataWorkspace.products.filter((product) => product.record);
  const loggableRecipes = dataWorkspace.recipes.filter((recipe) => recipe.calculation);

  useEffect(() => {
    const dialog = logDialogRef.current;
    if (logDialogOpen && dialog && !dialog.open) dialog.showModal();
    if (!logDialogOpen && dialog?.open) dialog.close();
  }, [logDialogOpen]);

  useEffect(() => {
    const dialog = viewDialogRef.current;
    if (viewDialogOpen && dialog && !dialog.open) dialog.showModal();
    if (!viewDialogOpen && dialog?.open) dialog.close();
  }, [viewDialogOpen]);

  useEffect(() => {
    const dialog = profileDialogRef.current;
    if (profileDialogOpen && dialog && !dialog.open) dialog.showModal();
    if (!profileDialogOpen && dialog?.open) dialog.close();
  }, [profileDialogOpen]);

  useEffect(() => {
    const dialog = goalSetupDialogRef.current;
    if (goalSetupDialogOpen && dialog && !dialog.open) dialog.showModal();
    if (!goalSetupDialogOpen && dialog?.open) dialog.close();
  }, [goalSetupDialogOpen]);

  function closeLogDialog() {
    setLogDialogOpen(false);
    setLogMode('choose');
  }

  function openLogDialog(mode: LogMode = 'choose') {
    setLogMode(mode);
    setLogDialogOpen(true);
  }

  function closeGoalSetupDialog() {
    setGoalSetupDialogOpen(false);
  }

  async function mutate(url: string, body: unknown) {
    setStatus('Saving…');
    setSaving(true);
    try {
      const response = await fetch(url, {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify(body),
      });
      if (!response.ok) {
        const message = await errorMessage(response);
        setStatus(message);
        return false;
      }
      setStatus('Saved.');
      router.refresh();
      return true;
    } catch {
      const message = 'Bòrd could not reach the Nutrition service. Try again.';
      setStatus(message);
      return false;
    } finally {
      setSaving(false);
    }
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
    if (await saveEnergyOrNutrientGoal({ nutrientCode, unit: nutrient?.canonicalUnit ?? '', kind, value: numeric })) {
      form.reset();
    }
  }

  async function saveEnergyOrNutrientGoal(input: {
    nutrientCode: string;
    unit: string;
    kind: string;
    value: number;
  }) {
    const goal = {
      nutrientCode: input.nutrientCode,
      unit: input.unit,
      sourceType: 'user_defined',
      startsOn: today,
      kind: input.kind,
      ...(input.kind === 'limit' ? { maximum: input.value } : { value: input.value }),
    };
    const saved = await mutate(`/api/v1/nutrition/profiles/${activeProfile.id}/goals`, { goal });
    if (saved) closeGoalSetupDialog();
    return saved;
  }

  async function previewWeightPlan() {
    const goalSetup = props.goalSetup;
    if (!goalSetup) return;
    setEstimatingPlan(true);
    setStatus('Calculating a maintenance estimate…');
    try {
      const response = await fetch(`/api/v1/nutrition/profiles/${activeProfile.id}/goals/estimate`, {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({
          action: 'preview',
          expectedProfileVersion: goalSetup.profileVersion,
          effectiveOn: today,
          palCategory: weightPlanPal,
        }),
      });
      if (!response.ok) {
        setStatus(await errorMessage(response));
        return;
      }
      const result = (await response.json()) as { estimate?: { roundedKcal?: number } };
      const value = result.estimate?.roundedKcal;
      if (!value) {
        setStatus('A maintenance estimate was not available for this profile.');
        return;
      }
      setMaintenanceEstimate(value);
      setStatus('Maintenance estimate ready. Review the suggested daily target below.');
    } catch {
      setStatus('Bòrd could not reach the Nutrition service. Try again.');
    } finally {
      setEstimatingPlan(false);
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
      closeLogDialog();
    }
  }

  async function logQuickProduct(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const form = event.currentTarget;
    const data = new FormData(form);
    const product = loggableProducts.find((item) => item.id === String(data.get('productId')));
    if (!product?.record) return;
    if (
      await mutate(`/api/v1/nutrition/profiles/${activeProfile.id}/intake/product`, {
        productId: product.id,
        quantity: Number(data.get('quantity')),
        unit: data.get('unit'),
        occurredAt: new Date(String(data.get('occurredAt'))).toISOString(),
        mealSlot: data.get('mealSlot'),
      })
    ) {
      form.reset();
      closeLogDialog();
    }
  }

  async function logQuickRecipe(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const form = event.currentTarget;
    const data = new FormData(form);
    const recipe = loggableRecipes.find((item) => item.id === String(data.get('recipeId')));
    if (!recipe?.calculation) return;
    if (
      await mutate(`/api/v1/nutrition/profiles/${activeProfile.id}/intake/recipe`, {
        recipeCalculationId: recipe.calculation.id,
        servingCount: Number(data.get('servingCount')),
        occurredAt: new Date(String(data.get('occurredAt'))).toISOString(),
        mealSlot: data.get('mealSlot'),
      })
    ) {
      form.reset();
      closeLogDialog();
    }
  }

  async function logQuickManual(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const form = event.currentTarget;
    const data = new FormData(form);
    const values = ['energy_kcal', 'protein', 'carbohydrate', 'total_fat'].flatMap(
      (nutrientCode) => {
        const raw = String(data.get(`manual-${nutrientCode}`) ?? '').trim();
        return raw ? [{ nutrientCode, amount: Number(raw) }] : [];
      },
    );
    if (
      await mutate(`/api/v1/nutrition/profiles/${activeProfile.id}/intake/manual`, {
        sourceName: data.get('sourceName'),
        quantity: Number(data.get('quantity')),
        unit: data.get('unit'),
        occurredAt: new Date(String(data.get('occurredAt'))).toISOString(),
        mealSlot: data.get('mealSlot'),
        values,
      })
    ) {
      form.reset();
      closeLogDialog();
    }
  }

  async function recordWeight(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const form = event.currentTarget;
    const data = new FormData(form);
    const enteredWeight = Number(data.get('weight'));
    const unit = String(data.get('weightUnit'));
    const weightKilograms = unit === 'lb' ? enteredWeight / POUNDS_PER_KILOGRAM : enteredWeight;
    if (
      await mutate(`/api/v1/nutrition/profiles/${activeProfile.id}/measurements`, {
        measuredAt: new Date(String(data.get('measuredAt'))).toISOString(),
        weightKilograms,
        sourceType: 'manual',
        approximate: data.get('approximate') === 'on',
        note: data.get('note'),
      })
    ) {
      form.reset();
      closeLogDialog();
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
    const created = createClientUuid();
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
    return completed;
  }

  async function copyDiaryDay(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const form = event.currentTarget;
    const data = new FormData(form);
    const completed = await runDiaryCommand(
      `copy-day:${String(data.get('sourceDate'))}:${String(data.get('targetDate'))}:${String(data.get('targetProfileId'))}`,
      {
        command: 'copy_day',
        sourceDate: data.get('sourceDate'),
        targetDate: data.get('targetDate'),
        targetProfileId: data.get('targetProfileId'),
      },
      form,
    );
    if (completed && logDialogOpen) closeLogDialog();
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
              {activeProfile.canManageGoals ? (
                <button type="button" onClick={() => setGoalSetupDialogOpen(true)}>
                  Edit goals
                </button>
              ) : null}
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

          <NutritionWeightTrackerCard
            canManageProfile={activeProfile.canManageProfile}
            weightTrend={props.weightTrend}
            onRecordWeight={() => openLogDialog('weight')}
            compact
          />

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

      {summary.currentEntries.length ||
      props.goals.length ||
      (props.weightTrend?.observations.length ?? 0) > 0 ? (
        <AiSummaryCards
          domain="nutrition"
          placement="nutrition"
          initialSummary={props.initialAiSummary}
        />
      ) : null}

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
            <button
              className={styles.profileSelector}
              type="button"
              aria-haspopup="dialog"
              onClick={() => setProfileDialogOpen(true)}
            >
              <UserCircle size={18} aria-hidden="true" />
              {activeProfile.displayName}
              <ChevronDown size={15} aria-hidden="true" />
            </button>
            <span className={styles.dateSelector}>
              <CalendarDays size={17} aria-hidden="true" />
              {dateRangeLabel(mealProjection.range.start, mealProjection.range.end)}
            </span>
          </div>
          <div className={styles.headerButtons}>
            <button
              className={styles.primaryAction}
              type="button"
              aria-haspopup="dialog"
              disabled={!activeProfile.canManageProfile}
              onClick={() => openLogDialog()}
            >
              <Plus size={17} aria-hidden="true" /> Record nutrition
            </button>
            <Link
              className={styles.secondaryButton}
              href={props.view === 'diary' ? '/settings/nutrition' : '/nutrition?view=diary'}
            >
              {props.view === 'diary' ? (
                <>
                  <Info size={17} aria-hidden="true" /> Diary settings
                </>
              ) : (
                <>
                  <NotebookTabs size={17} aria-hidden="true" /> View diary
                </>
              )}
            </Link>
          </div>
        </div>
      </header>

      <button
        className={styles.mobileViewButton}
        type="button"
        aria-haspopup="dialog"
        onClick={() => setViewDialogOpen(true)}
      >
        <span>
          <small>Nutrition view</small>
          {VIEW_LABELS[props.view]}
        </span>
        <ChevronDown size={18} aria-hidden="true" />
      </button>

      <nav className={styles.tabs} aria-label="Nutrition views">
        {VIEWS.map((view) => (
          <Link
            key={view}
            href={`/nutrition?view=${view}`}
            aria-current={props.view === view ? 'page' : undefined}
          >
            {VIEW_LABELS[view]}
          </Link>
        ))}
      </nav>

      <section className={styles.viewIntro} aria-labelledby="nutrition-view-heading">
        <div>
          <p className={styles.viewEyebrow}>You are viewing</p>
          <h2 id="nutrition-view-heading">{VIEW_LABELS[props.view]}</h2>
        </div>
        <p>{VIEW_EXPLAINERS[props.view]}</p>
      </section>

      <dialog
        ref={profileDialogRef}
        className={styles.compactDialog}
        aria-labelledby="nutrition-profile-dialog-title"
        onClose={() => setProfileDialogOpen(false)}
        onCancel={() => setProfileDialogOpen(false)}
      >
        <div className={styles.dialogHeader}>
          <div>
            <p className={styles.viewEyebrow}>Active person</p>
            <h2 id="nutrition-profile-dialog-title">{activeProfile.displayName}</h2>
          </div>
          <button
            className={styles.iconButton}
            type="button"
            aria-label="Close person details"
            onClick={() => setProfileDialogOpen(false)}
          >
            <X size={20} aria-hidden="true" />
          </button>
        </div>
        <p className={styles.dialogLead}>
          Nutrition records, goals, and permissions stay attached to the selected household profile.
        </p>
        <div className={styles.profileDialogActions}>
          <Link href="/settings/profiles">Manage household profiles</Link>
          <Link href="/settings/nutrition">Nutrition settings</Link>
        </div>
      </dialog>

      <dialog
        ref={viewDialogRef}
        className={styles.compactDialog}
        aria-labelledby="nutrition-view-dialog-title"
        onClose={() => setViewDialogOpen(false)}
        onCancel={() => setViewDialogOpen(false)}
      >
        <div className={styles.dialogHeader}>
          <div>
            <p className={styles.viewEyebrow}>Explore your data</p>
            <h2 id="nutrition-view-dialog-title">Choose a Nutrition view</h2>
          </div>
          <button
            className={styles.iconButton}
            type="button"
            aria-label="Close Nutrition views"
            onClick={() => setViewDialogOpen(false)}
          >
            <X size={20} aria-hidden="true" />
          </button>
        </div>
        <nav className={styles.viewDialogLinks} aria-label="Choose Nutrition view">
          {VIEWS.map((view) => (
            <Link
              key={view}
              href={`/nutrition?view=${view}`}
              aria-current={props.view === view ? 'page' : undefined}
              onClick={() => setViewDialogOpen(false)}
            >
              <span>
                <strong>{VIEW_LABELS[view]}</strong>
                <small>{VIEW_EXPLAINERS[view]}</small>
              </span>
              <ArrowRight size={18} aria-hidden="true" />
            </Link>
          ))}
        </nav>
      </dialog>

      <dialog
        ref={logDialogRef}
        className={styles.logDialog}
        aria-labelledby="nutrition-log-dialog-title"
        onClose={closeLogDialog}
        onCancel={closeLogDialog}
      >
        <div className={styles.dialogHeader}>
          <div>
            <p className={styles.viewEyebrow}>
              {logMode === 'weight' ? 'Weight tracker' : 'Food diary'}
            </p>
            <h2 id="nutrition-log-dialog-title">
              {logMode === 'choose'
                ? 'What would you like to record?'
                : logMode === 'weight'
                  ? 'Record weight'
                  : 'Record nutrition'}
            </h2>
          </div>
          <button
            className={styles.iconButton}
            type="button"
            aria-label="Close record nutrition dialog"
            onClick={closeLogDialog}
          >
            <X size={20} aria-hidden="true" />
          </button>
        </div>
        <p className={styles.dialogLead}>
          {logMode === 'weight'
            ? 'Add one private observation. Existing check-ins remain in your history.'
            : 'Confirmed food contributes to totals. Skipped meals add history without adding nutrients.'}
        </p>

        {logMode === 'choose' ? (
          <div className={styles.logOptions}>
            <button type="button" onClick={() => setLogMode('product')}>
              <Search size={22} aria-hidden="true" />
              <span>
                <strong>Food or packaged item</strong>
                <small>Record a portion from a product with Nutrition data.</small>
              </span>
              <ArrowRight size={18} aria-hidden="true" />
            </button>
            <button type="button" onClick={() => setLogMode('recipe')}>
              <Utensils size={22} aria-hidden="true" />
              <span>
                <strong>Recipe or meal</strong>
                <small>Record servings from a calculated recipe.</small>
              </span>
              <ArrowRight size={18} aria-hidden="true" />
            </button>
            <button type="button" onClick={() => setLogMode('manual')}>
              <NotebookTabs size={22} aria-hidden="true" />
              <span>
                <strong>Manual diary entry</strong>
                <small>Add a food or meal when no saved record applies.</small>
              </span>
              <ArrowRight size={18} aria-hidden="true" />
            </button>
            <button type="button" onClick={() => setLogMode('skipped')}>
              <CircleSlash2 size={22} aria-hidden="true" />
              <span>
                <strong>Skipped meal</strong>
                <small>Keep the diary accurate without adding nutrient values.</small>
              </span>
              <ArrowRight size={18} aria-hidden="true" />
            </button>
            <button type="button" onClick={() => setLogMode('copy')}>
              <ClipboardCopy size={22} aria-hidden="true" />
              <span>
                <strong>Copy a diary day</strong>
                <small>Reuse confirmed entries from another date.</small>
              </span>
              <ArrowRight size={18} aria-hidden="true" />
            </button>
            {activeProfile.weightTrackingEnabled && activeProfile.canManageProfile ? (
              <button type="button" onClick={() => setLogMode('weight')}>
                <Scale size={22} aria-hidden="true" />
                <span>
                  <strong>Weight check-in</strong>
                  <small>Record a private weight observation for the trend view.</small>
                </span>
                <ArrowRight size={18} aria-hidden="true" />
              </button>
            ) : null}
          </div>
        ) : (
          <button className={styles.backButton} type="button" onClick={() => setLogMode('choose')}>
            ← All record types
          </button>
        )}

        {logMode === 'weight' ? (
          <form className={styles.dialogForm} onSubmit={recordWeight} aria-busy={saving}>
            <div className={styles.dialogFieldRow}>
              <label>
                Weight
                <input
                  name="weight"
                  type="number"
                  min="0.1"
                  max={activeProfile.measurementSystem === 'imperial' ? 2204.6 : 1000}
                  step="0.1"
                  inputMode="decimal"
                  required
                />
              </label>
              <label>
                Unit
                <select
                  name="weightUnit"
                  defaultValue={activeProfile.measurementSystem === 'imperial' ? 'lb' : 'kg'}
                >
                  <option value="kg">Kilograms (kg)</option>
                  <option value="lb">Pounds (lb)</option>
                </select>
              </label>
            </div>
            <label>
              Measured at
              <input name="measuredAt" type="datetime-local" required />
            </label>
            <label>
              Note <span>Optional</span>
              <input
                name="note"
                maxLength={500}
                placeholder="e.g. Morning check-in"
                autoComplete="off"
              />
            </label>
            <label className={styles.dialogCheck}>
              <input name="approximate" type="checkbox" />
              This is an approximate observation
            </label>
            <p className={styles.formHint}>
              Bòrd stores the canonical value in kilograms and displays it using this profile&apos;s
              preferred unit.
            </p>
            <button className={styles.dialogPrimary} type="submit" disabled={saving}>
              <Scale size={17} aria-hidden="true" />
              {saving ? 'Saving…' : 'Save weight check-in'}
            </button>
          </form>
        ) : null}

        {logMode === 'product' ? (
          loggableProducts.length ? (
            <form className={styles.dialogForm} onSubmit={logQuickProduct}>
              <label>
                Product
                <select name="productId" required>
                  {loggableProducts.map((product) => (
                    <option key={product.id} value={product.id}>
                      {product.displayName}
                    </option>
                  ))}
                </select>
              </label>
              <div className={styles.dialogFieldRow}>
                <label>
                  Quantity
                  <input name="quantity" type="number" min="0.000001" step="any" required />
                </label>
                <label>
                  Unit
                  <input name="unit" defaultValue="g" maxLength={30} required />
                </label>
              </div>
              <div className={styles.dialogFieldRow}>
                <label>
                  When
                  <input name="occurredAt" type="datetime-local" required />
                </label>
                <label>
                  Meal
                  <select name="mealSlot" defaultValue="snack">
                    <option value="breakfast">Breakfast</option>
                    <option value="lunch">Lunch</option>
                    <option value="dinner">Dinner</option>
                    <option value="snack">Snack</option>
                    <option value="other">Other</option>
                  </select>
                </label>
              </div>
              <button className={styles.dialogPrimary} type="submit">
                Add to food diary
              </button>
            </form>
          ) : (
            <div className={styles.dialogEmpty}>
              <strong>No foods are ready to record</strong>
              <p>Add or import Nutrition data for a product first.</p>
              <Link href="/pantry">Open Pantry</Link>
            </div>
          )
        ) : null}

        {logMode === 'recipe' ? (
          loggableRecipes.length ? (
            <form className={styles.dialogForm} onSubmit={logQuickRecipe}>
              <label>
                Recipe
                <select name="recipeId" required>
                  {loggableRecipes.map((recipe) => (
                    <option key={recipe.id} value={recipe.id}>
                      {recipe.title}
                    </option>
                  ))}
                </select>
              </label>
              <div className={styles.dialogFieldRow}>
                <label>
                  Servings eaten
                  <input
                    name="servingCount"
                    type="number"
                    min="0.01"
                    step="any"
                    defaultValue="1"
                    required
                  />
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
              </div>
              <label>
                When
                <input name="occurredAt" type="datetime-local" required />
              </label>
              <button className={styles.dialogPrimary} type="submit">
                Add recipe to food diary
              </button>
            </form>
          ) : (
            <div className={styles.dialogEmpty}>
              <strong>No calculated recipes are ready</strong>
              <p>Calculate a recipe’s Nutrition data before recording a serving.</p>
              <Link href="/nutrition?view=diary" onClick={closeLogDialog}>
                Open diary tools
              </Link>
            </div>
          )
        ) : null}

        {logMode === 'manual' ? (
          <form className={styles.dialogForm} onSubmit={logQuickManual}>
            <label>
              Food or meal name
              <input name="sourceName" maxLength={300} required />
            </label>
            <div className={styles.dialogFieldRow}>
              <label>
                Portion amount
                <input
                  name="quantity"
                  type="number"
                  min="0.000001"
                  step="any"
                  defaultValue="1"
                  required
                />
              </label>
              <label>
                Portion unit
                <input name="unit" defaultValue="portion" maxLength={30} required />
              </label>
            </div>
            <div className={styles.dialogFieldRow}>
              <label>
                When
                <input name="occurredAt" type="datetime-local" required />
              </label>
              <label>
                Meal
                <select name="mealSlot" defaultValue="snack">
                  <option value="breakfast">Breakfast</option>
                  <option value="lunch">Lunch</option>
                  <option value="dinner">Dinner</option>
                  <option value="snack">Snack</option>
                  <option value="other">Other</option>
                </select>
              </label>
            </div>
            <fieldset className={styles.manualNutrients}>
              <legend>Nutrition for this portion</legend>
              {(['energy_kcal', 'protein', 'carbohydrate', 'total_fat'] as const).map((code) => (
                <label key={code}>
                  {definition.get(code)?.displayName ?? code} (
                  {definition.get(code)?.canonicalUnit ?? ''})
                  <input
                    name={`manual-${code}`}
                    type="number"
                    min="0"
                    step="any"
                    required={code === 'energy_kcal'}
                  />
                </label>
              ))}
            </fieldset>
            <p className={styles.formHint}>
              Manual values are marked as estimates so their provenance stays visible.
            </p>
            <button className={styles.dialogPrimary} type="submit">
              Add manual entry
            </button>
          </form>
        ) : null}

        {logMode === 'skipped' ? (
          <form className={styles.dialogForm} onSubmit={recordSkipped}>
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
            <button className={styles.dialogPrimary} type="submit">
              Record skipped meal
            </button>
          </form>
        ) : null}

        {logMode === 'copy' ? (
          <form className={styles.dialogForm} onSubmit={copyDiaryDay}>
            <div className={styles.dialogFieldRow}>
              <label>
                Copy from
                <input name="sourceDate" type="date" required />
              </label>
              <label>
                Copy to
                <input name="targetDate" type="date" required />
              </label>
            </div>
            <label>
              Person
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
            <p className={styles.formHint}>
              Only confirmed entries are copied; the original diary remains unchanged.
            </p>
            <button className={styles.dialogPrimary} type="submit">
              Copy confirmed entries
            </button>
          </form>
        ) : null}
      </dialog>

      {props.view === 'overview' ? (
        <>
          {!hasConfiguredGoals || summary.currentEntries.length === 0 || mealProjection.meals.length === 0 ? (
            <NutritionSetupOverview
              profileName={activeProfile.displayName}
              hasConfiguredGoals={hasConfiguredGoals}
              canManageGoals={activeProfile.canManageGoals}
              canManageProfile={activeProfile.canManageProfile}
              hasDiaryEntries={summary.currentEntries.length > 0}
              hasPlannedMeals={mealProjection.meals.length > 0}
              savedGoalDescription={savedGoalDescription}
              weightTrend={props.weightTrend}
              onRecordNutrition={() => openLogDialog()}
              onRecordWeight={() => openLogDialog('weight')}
              onConfigureGoals={() => setGoalSetupDialogOpen(true)}
            />
          ) : null}
          {hasConfiguredGoals ? redesignedOverview : null}
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
                <div className={styles.emptyState}>
                  <NotebookTabs size={24} aria-hidden="true" />
                  <div>
                    <h3>Your food diary is ready</h3>
                    <p>
                      Record food, a skipped meal, or copy a previous day. Nothing is assumed until
                      you confirm it.
                    </p>
                  </div>
                  <button
                    type="button"
                    disabled={!activeProfile.canManageProfile}
                    onClick={() => openLogDialog()}
                  >
                    Record nutrition
                  </button>
                </div>
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
              <div className={styles.emptyState}>
                <Info size={24} aria-hidden="true" />
                <div>
                  <h3>No confirmed nutrient data today</h3>
                  <p>
                    Record a food or meal to see amounts and coverage. Unknown nutrients stay blank
                    rather than appearing as zero.
                  </p>
                </div>
                <button
                  type="button"
                  disabled={!activeProfile.canManageProfile}
                  onClick={() => openLogDialog()}
                >
                  Record nutrition
                </button>
              </div>
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

      <dialog
        ref={goalSetupDialogRef}
        className={`${styles.logDialog} ${styles.goalSetupDialog}`}
        aria-labelledby="nutrition-goal-setup-title"
        onClose={closeGoalSetupDialog}
        onCancel={closeGoalSetupDialog}
      >
        <div className={styles.dialogHeader}>
          <div>
            <p className={styles.viewEyebrow}>Nutrition onboarding</p>
            <h2 id="nutrition-goal-setup-title">Choose a daily nutrition goal</h2>
          </div>
          <button
            className={styles.iconButton}
            type="button"
            aria-label="Close daily nutrition goal setup"
            onClick={closeGoalSetupDialog}
          >
            <X size={20} aria-hidden="true" />
          </button>
        </div>
        <p className={styles.dialogLead}>
          Set a daily target when you are ready. This keeps setup separate from your recorded
          nutrition views.
        </p>
        <div className={`${styles.twoColumn} ${styles.goalSetupBody}`}>
          <section className={styles.panel}>
            <h2>Current goal history</h2>
            {props.goals.length === 0 ? (
              <div className={styles.emptyState}>
                <TrendingUp size={24} aria-hidden="true" />
                <div>
                  <h3>No Nutrition goals yet</h3>
                  <p>
                    Add a target when you want progress comparisons. Recorded amounts remain useful
                    without one.
                  </p>
                </div>
              </div>
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
          <section id="daily-goal-setup" className={styles.panel}>
            <h2>Choose a daily nutrition goal</h2>
            <p className={styles.muted}>
              Start with a calorie goal or add another nutrient. Goals are versioned, so saving a
              new choice preserves earlier evidence.
            </p>
            <section className={styles.goalGuide} aria-labelledby="daily-calorie-goal-title">
              <div>
                <h2 id="daily-calorie-goal-title">Daily calorie target</h2>
                <p>
                  Choose an editable starting point. These examples are general planning values,
                  not a diagnosis or a prescription.
                </p>
              </div>
              <div className={styles.goalExamples} aria-label="Daily calorie examples">
                {[1800, 2000, 2200].map((value) => (
                  <button
                    key={value}
                    type="button"
                    disabled={saving}
                    onClick={() =>
                      void saveEnergyOrNutrientGoal({
                        nutrientCode: 'energy_kcal',
                        unit: 'kcal',
                        kind: 'target',
                        value,
                      })
                    }
                  >
                    Use {value.toLocaleString()} kcal
                  </button>
                ))}
              </div>
            </section>
            {canPlanFromWeightGoal ? (
              <section className={styles.goalGuide} aria-labelledby="weight-plan-title">
                <div>
                  <h2 id="weight-plan-title">Use your saved weight plan</h2>
                  <p>
                    {savedWeightGoal?.nutritionGoalType === 'loss' ? 'Loss' : 'Gain'} goal
                    {savedWeightGoal?.currentWeightKilograms !== null &&
                    savedWeightGoal?.targetWeightKilograms !== null
                      ? `: ${savedWeightGoal.currentWeightKilograms.toFixed(1)} kg to ${savedWeightGoal.targetWeightKilograms.toFixed(1)} kg.`
                      : '.'}{' '}
                    {savedWeightGoal?.targetDate
                      ? `Saved target date: ${savedWeightGoal.targetDate}.`
                      : 'Add a target date any time in Nutrition settings.'}
                  </p>
                </div>
                <div className={styles.goalGuideControls}>
                  <label>
                    Activity for this estimate
                    <select
                      value={weightPlanPal}
                      onChange={(event) => setWeightPlanPal(event.target.value)}
                    >
                      <option value="inactive">Mostly sitting</option>
                      <option value="low_active">Light daily movement</option>
                      <option value="active">Active most days</option>
                      <option value="very_active">Very active</option>
                    </select>
                  </label>
                  <label>
                    Weekly pace
                    <select
                      value={weightPlanPace}
                      onChange={(event) =>
                        setWeightPlanPace(event.target.value === 'steady' ? 'steady' : 'gradual')
                      }
                    >
                      <option value="gradual">Gradual — about 0.25 kg (0.5 lb) per week</option>
                      <option value="steady">Steady — about 0.5 kg (1 lb) per week</option>
                    </select>
                  </label>
                </div>
                <button
                  className={styles.goalEstimateButton}
                  type="button"
                  disabled={estimatingPlan}
                  onClick={() => void previewWeightPlan()}
                >
                  {estimatingPlan ? 'Calculating…' : 'Calculate a planning target'}
                </button>
                {maintenanceEstimate !== null && guidedCalorieTarget !== null ? (
                  <div className={styles.goalEstimateResult} role="status">
                    <strong>{maintenanceEstimate.toLocaleString()} kcal/day estimated maintenance</strong>
                    {guidedTargetIsTooLow ? (
                      <p>
                        This pace would suggest less than 1,200 kcal/day. Bòrd will not create
                        this target; choose a gentler plan or talk with a qualified clinician.
                      </p>
                    ) : (
                      <>
                        <p>
                          A {paceAdjustment.toLocaleString()} kcal/day planning adjustment suggests{' '}
                          <strong>{guidedCalorieTarget.toLocaleString()} kcal/day</strong>. Review
                          it regularly: energy needs can change as weight changes.
                        </p>
                        <button
                          type="button"
                          disabled={saving}
                          onClick={() =>
                            void saveEnergyOrNutrientGoal({
                              nutrientCode: 'energy_kcal',
                              unit: 'kcal',
                              kind: 'target',
                              value: guidedCalorieTarget,
                            })
                          }
                        >
                          Use {guidedCalorieTarget.toLocaleString()} kcal/day
                        </button>
                      </>
                    )}
                  </div>
                ) : null}
                <p className={styles.goalDisclosure}>
                  This calculation requires the optional body inputs, an explicit activity choice,
                  and your consent to estimated targets. It is a planning estimate, not medical
                  advice.
                </p>
              </section>
            ) : null}
            <form className={styles.form} onSubmit={addGoal}>
              <h2>Custom daily goal</h2>
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
          </section>
        </div>
      </dialog>

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
