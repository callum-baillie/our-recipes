import Link from 'next/link';
import type { CSSProperties } from 'react';
import { Check, Minus, Plus, Target, TrendingDown, TrendingUp, TriangleAlert } from 'lucide-react';

import { NutritionVisualMarker } from './nutrition-visual-marker';
import { nutritionGoalComparison, type ChartGoal } from '@/lib/domain/nutrition-chart-datasets';
import styles from './nutrition-overview.module.css';

type OverviewEntry = {
  id: string;
  mealSlot: string;
  sourceNameSnapshot: string;
  values: ReadonlyArray<{ nutrientCode: string; amount: number }>;
};

export type NutritionOverviewProps = {
  profileName: string;
  today: string;
  totals: Record<string, number>;
  planned: Record<string, number>;
  showPlanned: boolean;
  trend: ReadonlyArray<{ date: string; energyKcal: number | null; entryCount: number }>;
  goals: ChartGoal[];
  entriesToday: ReadonlyArray<OverviewEntry>;
  labels: Record<string, string>;
  units: Record<string, string>;
  weight: {
    unit: string;
    latest: number;
    change: number | null;
    series: number[];
    target: number | null;
  } | null;
  completeness: number | null;
  hasEstimates: boolean;
  canRecord: boolean;
  canManageGoals: boolean;
  onLog: () => void;
  onEditGoals: () => void;
  onLogWeight: () => void;
};

const MACROS = [
  { code: 'protein', label: 'Protein' },
  { code: 'carbohydrate', label: 'Carbs' },
  { code: 'total_fat', label: 'Fat' },
] as const;
const CORE = new Set<string>(['energy_kcal', ...MACROS.map((macro) => macro.code)]);
const KCAL_PER_GRAM: Record<string, number> = { protein: 4, carbohydrate: 4, total_fat: 9 };
const SLOT_ORDER = ['breakfast', 'lunch', 'dinner', 'snack', 'other'];

function fmt(value: number, digits = 0) {
  return value.toLocaleString(undefined, { maximumFractionDigits: digits });
}

function boundary(goal: ChartGoal | null): number | null {
  if (!goal) return null;
  return goal.kind === 'target' || goal.kind === 'minimum' ? goal.value : goal.maximum;
}

function weekday(date: string) {
  return new Intl.DateTimeFormat(undefined, { weekday: 'narrow', timeZone: 'UTC' }).format(
    new Date(`${date}T12:00:00Z`),
  );
}
function weekdayLong(date: string) {
  return new Intl.DateTimeFormat(undefined, {
    weekday: 'long',
    month: 'short',
    day: 'numeric',
    timeZone: 'UTC',
  }).format(new Date(`${date}T12:00:00Z`));
}

type Status = 'none' | 'good' | 'near' | 'over' | 'low';

/** One reading of a goal, shared by the target tiles so every nutrient speaks the same language. */
function readGoal(goals: ChartGoal[], today: string, code: string, amount: number | null) {
  const comparison = nutritionGoalComparison(goals, today, code, amount);
  const goal = comparison.status === 'ambiguous_goal' ? null : comparison.goal;
  const limit = boundary(goal);
  const ratio = amount !== null && limit ? amount / limit : null;
  let status: Status = 'none';
  let note = amount === null ? 'No data yet' : 'No target set';
  if (goal && limit && amount !== null) {
    if (goal.kind === 'limit') {
      status = amount > limit ? 'over' : amount > limit * 0.85 ? 'near' : 'good';
      note =
        amount > limit
          ? `${fmt(amount - limit)} ${goal.unit} over`
          : `${fmt(limit - amount)} ${goal.unit} left`;
    } else if (goal.kind === 'range') {
      const minimum = goal.minimum ?? 0;
      status = amount < minimum ? 'low' : amount > limit ? 'over' : 'good';
      note =
        status === 'low'
          ? `${fmt(minimum - amount)} ${goal.unit} to minimum`
          : status === 'over'
            ? `${fmt(amount - limit)} ${goal.unit} over`
            : 'In range';
    } else {
      status = amount >= limit ? 'good' : 'low';
      note = amount >= limit ? 'Target reached' : `${fmt(limit - amount)} ${goal.unit} to go`;
    }
  } else if (goal && limit && amount === null) {
    note = 'Nothing logged yet';
  }
  return { goal, limit, ratio, status, note };
}

function StatusIcon({ status }: { status: Status }) {
  if (status === 'over') return <TriangleAlert size={14} aria-hidden="true" />;
  if (status === 'good') return <Check size={14} aria-hidden="true" />;
  if (status === 'low' || status === 'near') return <Minus size={14} aria-hidden="true" />;
  return null;
}

function CalorieRing(props: {
  energy: number | null;
  target: number | null;
  planned: number | null;
  kind: ChartGoal['kind'] | null;
}) {
  const radius = 54;
  const circumference = 2 * Math.PI * radius;
  const ratio = props.energy !== null && props.target ? props.energy / props.target : 0;
  const filled = Math.min(1, ratio);
  const over = props.target !== null && props.energy !== null && props.energy > props.target;
  const plannedRatio =
    props.planned !== null && props.target ? Math.min(1 - filled, props.planned / props.target) : 0;
  const remaining =
    props.target !== null && props.energy !== null ? props.target - props.energy : null;
  return (
    <div className={styles.ringWrap}>
      <svg className={styles.ring} viewBox="0 0 128 128" role="presentation" aria-hidden="true">
        <circle className={styles.ringTrack} cx="64" cy="64" r={radius} />
        {plannedRatio > 0 && (
          <circle
            className={styles.ringPlanned}
            cx="64"
            cy="64"
            r={radius}
            strokeDasharray={`${plannedRatio * circumference} ${circumference}`}
            strokeDashoffset={-filled * circumference}
          />
        )}
        {props.target !== null && (
          <circle
            className={`${styles.ringValue} ${over ? styles.ringOver : ''}`}
            cx="64"
            cy="64"
            r={radius}
            strokeDasharray={`${filled * circumference} ${circumference}`}
            style={
              {
                '--ring-length': `${filled * circumference}`,
                '--ring-full': `${circumference}`,
              } as CSSProperties
            }
          />
        )}
      </svg>
      <div className={styles.ringCenter}>
        <strong>{props.energy === null ? '—' : fmt(props.energy)}</strong>
        <span>{props.target ? `of ${fmt(props.target)} kcal` : 'kcal today'}</span>
      </div>
      <p className={styles.ringCaption} data-over={over || undefined}>
        {remaining === null
          ? props.target
            ? `${fmt(props.target)} kcal target`
            : 'Set a calorie target to see your progress'
          : remaining >= 0
            ? `${fmt(remaining)} kcal left`
            : `${fmt(-remaining)} kcal over`}
      </p>
    </div>
  );
}

function WeekChart({
  trend,
  target,
  today,
}: {
  trend: NutritionOverviewProps['trend'];
  target: number | null;
  today: string;
}) {
  const days = trend.slice(-7);
  const logged = days.filter((day) => day.energyKcal !== null && day.entryCount > 0);
  const average = logged.length
    ? logged.reduce((sum, day) => sum + (day.energyKcal ?? 0), 0) / logged.length
    : null;
  const peak = Math.max(target ? target * 1.15 : 0, ...days.map((day) => day.energyKcal ?? 0), 1);
  return (
    <div className={styles.week}>
      <div className={styles.weekHead}>
        <div>
          <h3>Last 7 days</h3>
          <p>
            {average === null
              ? 'No recorded days yet'
              : `${fmt(average)} kcal average · ${logged.length} of ${days.length} days logged`}
          </p>
        </div>
      </div>
      <div
        className={styles.bars}
        role="img"
        aria-label={`Daily calories for the last ${days.length} days`}
      >
        {target !== null && (
          <div className={styles.plot} aria-hidden="true">
            <span
              className={styles.targetLine}
              style={{ bottom: `${(target / peak) * 100}%` }}
              title={`Target ${fmt(target)} kcal`}
            >
              <small>Target {fmt(target)}</small>
            </span>
          </div>
        )}
        {days.map((day, index) => {
          const value = day.energyKcal;
          const isToday = day.date === today;
          return (
            <div
              key={day.date}
              className={styles.barColumn}
              data-today={isToday || undefined}
              data-empty={value === null || undefined}
              style={{ '--i': index } as CSSProperties}
              title={`${weekdayLong(day.date)}: ${value === null ? 'nothing recorded' : `${fmt(value)} kcal`}`}
            >
              <span className={styles.barValue}>{value === null ? '' : fmt(value)}</span>
              <span className={styles.barTrack}>
                <span
                  className={styles.bar}
                  style={{ height: `${value === null ? 0 : Math.max(3, (value / peak) * 100)}%` }}
                />
              </span>
              <span className={styles.barDay}>{weekday(day.date)}</span>
            </div>
          );
        })}
      </div>
    </div>
  );
}

function Sparkline({ series, target }: { series: number[]; target: number | null }) {
  if (series.length < 2) return null;
  const values = target === null ? series : [...series, target];
  const min = Math.min(...values);
  const max = Math.max(...values);
  const span = max - min || 1;
  const x = (index: number) => (index / (series.length - 1)) * 100;
  const y = (value: number) => 28 - ((value - min) / span) * 24;
  const points = series.map((value, index) => `${x(index)},${y(value)}`).join(' ');
  return (
    <svg
      className={styles.spark}
      viewBox="0 0 100 32"
      preserveAspectRatio="none"
      aria-hidden="true"
    >
      {target !== null && (
        <line className={styles.sparkTarget} x1="0" x2="100" y1={y(target)} y2={y(target)} />
      )}
      <polyline className={styles.sparkLine} points={points} pathLength={1} />
      <circle
        className={styles.sparkDot}
        cx={x(series.length - 1)}
        cy={y(series.at(-1)!)}
        r="2.4"
      />
    </svg>
  );
}

export function NutritionOverview(props: NutritionOverviewProps) {
  const { totals, goals, today, labels, units } = props;
  const energy = totals.energy_kcal ?? null;
  const energyRead = readGoal(goals, today, 'energy_kcal', energy);
  const target = energyRead.limit;
  const planned = props.showPlanned ? (props.planned.energy_kcal ?? null) : null;

  const macroKcal = MACROS.reduce(
    (sum, macro) => sum + (totals[macro.code] ?? 0) * (KCAL_PER_GRAM[macro.code] ?? 0),
    0,
  );

  const targetCodes = [
    ...new Set(
      goals
        .filter((goal) => goal.state === 'active' && !CORE.has(goal.nutrientCode))
        .map((goal) => goal.nutrientCode),
    ),
  ];
  const targetTiles = targetCodes
    .map((code) => ({
      code,
      amount: totals[code] ?? null,
      read: readGoal(goals, today, code, totals[code] ?? null),
    }))
    .filter((tile) => tile.read.goal);

  const slots = SLOT_ORDER.map((slot) => ({
    slot,
    items: props.entriesToday.filter(
      (entry) => (SLOT_ORDER.includes(entry.mealSlot) ? entry.mealSlot : 'other') === slot,
    ),
  })).filter((group) => group.items.length);
  const hasFood = props.entriesToday.length > 0;
  const entryKcal = (entry: OverviewEntry) =>
    entry.values.find((value) => value.nutrientCode === 'energy_kcal')?.amount ?? null;

  return (
    <div className={styles.overview}>
      <section className={`${styles.card} ${styles.hero}`} aria-label="Today at a glance">
        <div className={styles.heroRing}>
          <CalorieRing
            energy={energy}
            target={target}
            planned={planned}
            kind={energyRead.goal?.kind ?? null}
          />
          <div className={styles.heroActions}>
            <button
              type="button"
              className={styles.logButton}
              onClick={props.onLog}
              disabled={!props.canRecord}
            >
              <Plus size={16} aria-hidden="true" />
              Log food
            </button>
            {!energyRead.goal && props.canManageGoals && (
              <button type="button" className={styles.ghostButton} onClick={props.onEditGoals}>
                <Target size={16} aria-hidden="true" />
                Set targets
              </button>
            )}
          </div>
          {planned !== null && planned > 0 && (
            <p className={styles.plannedNote}>
              <span aria-hidden="true" className={styles.plannedSwatch} />
              {fmt(planned)} kcal planned still to come
            </p>
          )}
        </div>

        <div className={styles.heroMacros}>
          <div className={styles.sectionTitle}>
            <h3>Macros</h3>
            {macroKcal > 0 && <span>{fmt(macroKcal)} kcal from macros</span>}
          </div>
          <ul className={styles.macroList}>
            {MACROS.map((macro, index) => {
              const amount = totals[macro.code] ?? null;
              const read = readGoal(goals, today, macro.code, amount);
              const share =
                amount !== null && macroKcal > 0
                  ? ((amount * (KCAL_PER_GRAM[macro.code] ?? 0)) / macroKcal) * 100
                  : null;
              const fill = read.ratio !== null ? Math.min(100, read.ratio * 100) : (share ?? 0);
              return (
                <li
                  key={macro.code}
                  data-nutrient={macro.code}
                  style={{ '--i': index } as CSSProperties}
                >
                  <div className={styles.macroTop}>
                    <NutritionVisualMarker nutrientCode={macro.code} compact />
                    <span className={styles.macroName}>{macro.label}</span>
                    <span className={styles.macroValue}>
                      <strong>{amount === null ? '—' : fmt(amount)}</strong>
                      {read.limit ? <span> / {fmt(read.limit)} g</span> : <span> g</span>}
                    </span>
                  </div>
                  <div
                    className={styles.meter}
                    role="progressbar"
                    aria-label={`${macro.label} ${read.limit ? 'progress towards goal' : 'share of calories'}`}
                    aria-valuemin={0}
                    aria-valuemax={100}
                    aria-valuenow={Math.round(fill)}
                  >
                    <span
                      style={{
                        width: `${fill}%`,
                        background: `var(--nutrition-${macro.code === 'total_fat' ? 'fat' : macro.code})`,
                      }}
                    />
                  </div>
                  <p className={styles.macroNote}>
                    {read.limit
                      ? read.note
                      : share === null
                        ? 'No data yet'
                        : `${fmt(share)}% of calories`}
                  </p>
                </li>
              );
            })}
          </ul>
        </div>

        <WeekChart trend={props.trend} target={target} today={today} />
      </section>

      <div className={styles.glanceGrid}>
        <section className={styles.card} aria-labelledby="targets-heading">
          <div className={styles.sectionTitle}>
            <h3 id="targets-heading">Targets &amp; limits</h3>
            {props.canManageGoals && (
              <button type="button" className={styles.linkButton} onClick={props.onEditGoals}>
                Edit goals
              </button>
            )}
          </div>
          {targetTiles.length ? (
            <ul className={styles.tiles}>
              {targetTiles.slice(0, 8).map(({ code, amount, read }, index) => (
                <li key={code} data-status={read.status} style={{ '--i': index } as CSSProperties}>
                  <div className={styles.tileTop}>
                    <NutritionVisualMarker nutrientCode={code} compact />
                    <span className={styles.tileName}>{labels[code] ?? code}</span>
                    <span className={styles.tileStatus}>
                      <StatusIcon status={read.status} />
                    </span>
                  </div>
                  <p className={styles.tileValue}>
                    <strong>{amount === null ? '—' : fmt(amount, amount < 10 ? 1 : 0)}</strong>
                    <span>
                      {read.goal?.kind === 'limit' ? ' of ' : ' / '}
                      {read.limit ? fmt(read.limit) : '—'} {read.goal?.unit ?? units[code] ?? ''}
                    </span>
                  </p>
                  <div className={styles.meter} aria-hidden="true">
                    <span style={{ width: `${Math.min(100, (read.ratio ?? 0) * 100)}%` }} />
                  </div>
                  <p className={styles.tileNote}>
                    {read.goal?.kind === 'limit'
                      ? 'Limit · '
                      : read.goal?.kind === 'minimum'
                        ? 'Minimum · '
                        : ''}
                    {read.note}
                  </p>
                </li>
              ))}
            </ul>
          ) : (
            <div className={styles.quietEmpty}>
              <p>Add targets for fibre, sodium or sugar to track them here.</p>
              {props.canManageGoals && (
                <button type="button" className={styles.ghostButton} onClick={props.onEditGoals}>
                  <Target size={16} aria-hidden="true" />
                  Set targets
                </button>
              )}
            </div>
          )}
        </section>

        <section className={styles.card} aria-labelledby="meals-heading">
          <div className={styles.sectionTitle}>
            <h3 id="meals-heading">Today&apos;s food</h3>
            <Link className={styles.linkButton} href={`/nutrition?view=diary&date=${today}`}>
              Open diary
            </Link>
          </div>
          {hasFood ? (
            <div className={styles.meals}>
              {slots.map((group) => {
                const subtotal = group.items.reduce(
                  (sum, entry) => sum + (entryKcal(entry) ?? 0),
                  0,
                );
                return (
                  <div key={group.slot} className={styles.mealGroup}>
                    <div className={styles.mealHead}>
                      <span>{group.slot}</span>
                      <span>{subtotal ? `${fmt(subtotal)} kcal` : ''}</span>
                    </div>
                    <ul>
                      {group.items.map((entry) => {
                        const kcal = entryKcal(entry);
                        return (
                          <li key={entry.id}>
                            <span>{entry.sourceNameSnapshot || 'Unnamed food'}</span>
                            <small>{kcal === null ? 'No calories' : `${fmt(kcal)} kcal`}</small>
                          </li>
                        );
                      })}
                    </ul>
                  </div>
                );
              })}
            </div>
          ) : (
            <div className={styles.quietEmpty}>
              <p>No food recorded today. Log a meal to fill in the ring and bars.</p>
              <button
                type="button"
                className={styles.ghostButton}
                onClick={props.onLog}
                disabled={!props.canRecord}
              >
                <Plus size={16} aria-hidden="true" />
                Log food
              </button>
            </div>
          )}
          {(props.completeness !== null || props.hasEstimates) && hasFood && (
            <p className={styles.dataQuality}>
              {props.completeness !== null &&
                `${Math.round(props.completeness * 100)}% of nutrient data known`}
              {props.completeness !== null && props.hasEstimates && ' · '}
              {props.hasEstimates && 'includes estimates'}
            </p>
          )}
        </section>

        {props.weight && (
          <section
            className={`${styles.card} ${styles.weightCard}`}
            aria-labelledby="weight-heading"
          >
            <div className={styles.sectionTitle}>
              <h3 id="weight-heading">Weight</h3>
              <button type="button" className={styles.linkButton} onClick={props.onLogWeight}>
                Log weigh-in
              </button>
            </div>
            <p className={styles.weightValue}>
              <strong>{fmt(props.weight.latest, 1)}</strong> <span>{props.weight.unit}</span>
              {props.weight.change !== null && Math.abs(props.weight.change) >= 0.05 && (
                <em data-direction={props.weight.change < 0 ? 'down' : 'up'}>
                  {props.weight.change < 0 ? (
                    <TrendingDown size={14} aria-hidden="true" />
                  ) : (
                    <TrendingUp size={14} aria-hidden="true" />
                  )}
                  {props.weight.change > 0 ? '+' : ''}
                  {fmt(props.weight.change, 1)} {props.weight.unit}
                </em>
              )}
            </p>
            <Sparkline series={props.weight.series} target={props.weight.target} />
            {props.weight.target !== null && (
              <p className={styles.tileNote}>
                Target {fmt(props.weight.target, 1)} {props.weight.unit}
              </p>
            )}
          </section>
        )}
      </div>
    </div>
  );
}
