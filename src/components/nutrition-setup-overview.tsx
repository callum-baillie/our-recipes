'use client';

import { ArrowRight, Check, Circle, Scale } from 'lucide-react';
import Link from 'next/link';

import styles from '@/components/nutrition-setup-overview.module.css';
import type { NutritionWeightTrend } from '@/lib/domain/nutrition-weight-trend';

type NutritionSetupOverviewProps = {
  profileName: string;
  hasConfiguredGoals: boolean;
  canManageGoals: boolean;
  canManageProfile: boolean;
  hasDiaryEntries: boolean;
  hasPlannedMeals: boolean;
  savedGoalDescription?: string | null;
  weightTrend?: NutritionWeightTrend | null;
  onRecordNutrition: () => void;
  onRecordWeight: () => void;
  onConfigureGoals: () => void;
};

type NutritionWeightTrackerCardProps = {
  canManageProfile: boolean;
  weightTrend?: NutritionWeightTrend | null;
  onRecordWeight: () => void;
  compact?: boolean;
};

function SetupStatus({ complete }: { complete: boolean }) {
  return (
    <span
      className={`${styles.stepStatus} ${complete ? styles.stepComplete : ''}`}
      aria-label={complete ? 'Complete' : 'Not complete'}
    >
      {complete ? <Check size={16} aria-hidden="true" /> : <Circle size={16} aria-hidden="true" />}
    </span>
  );
}

function latestObservation(trend?: NutritionWeightTrend | null) {
  if (!trend || trend.status !== 'ready') return null;
  return [...trend.observations]
    .sort((left, right) => left.measuredAt.localeCompare(right.measuredAt))
    .at(-1);
}

export function NutritionWeightTrackerCard({
  canManageProfile,
  weightTrend,
  onRecordWeight,
  compact = false,
}: NutritionWeightTrackerCardProps) {
  const latest = latestObservation(weightTrend);
  const disabled = !weightTrend || weightTrend.status === 'disabled';

  return (
    <section
      className={`${styles.weightCard} ${compact ? styles.weightCardCompact : ''}`}
      aria-labelledby={compact ? 'overview-weight-title' : 'setup-weight-title'}
    >
      <header>
        <span className={styles.featureIcon}>
          <Scale size={20} aria-hidden="true" />
        </span>
        <div>
          <h2 id={compact ? 'overview-weight-title' : 'setup-weight-title'}>Weight tracker</h2>
          <p>
            Private check-ins for your own progress. Individual readings are never health scores.
          </p>
        </div>
      </header>

      {disabled ? (
        <div className={styles.weightEmpty}>
          <strong>Weight tracking is off</strong>
          <span>Enable it for {weightTrend?.profileLabel ?? 'this profile'} before recording.</span>
          {canManageProfile ? (
            <Link href="/account/nutrition#weight-tracking">
              Enable weight tracking <ArrowRight size={15} aria-hidden="true" />
            </Link>
          ) : null}
        </div>
      ) : latest ? (
        <div className={styles.weightReading}>
          <span>Latest check-in</span>
          <strong>
            {latest.displayWeight} {weightTrend.unit}
          </strong>
          <time dateTime={latest.measuredAt}>
            {new Intl.DateTimeFormat(undefined, {
              month: 'short',
              day: 'numeric',
              year: 'numeric',
            }).format(new Date(latest.measuredAt))}
          </time>
        </div>
      ) : (
        <div className={styles.weightEmpty}>
          <strong>No weight check-ins yet</strong>
          <span>Record a first observation when you are ready.</span>
        </div>
      )}

      {!disabled && canManageProfile ? (
        <div className={styles.weightActions}>
          <button type="button" onClick={onRecordWeight}>
            <Scale size={16} aria-hidden="true" />
            {latest ? 'Record weight' : 'Record first weight'}
          </button>
          <Link href="/nutrition?view=trends">View trend</Link>
        </div>
      ) : null}
    </section>
  );
}

export function NutritionSetupOverview({
  profileName,
  hasConfiguredGoals,
  canManageGoals,
  canManageProfile,
  hasDiaryEntries,
  hasPlannedMeals,
  savedGoalDescription,
  onRecordNutrition,
  onConfigureGoals,
}: NutritionSetupOverviewProps) {
  return (
    <div className={styles.setup}>
      <p>
        {profileName} can record food without completing these optional actions. A weight direction
        and daily nutrient goals are separate choices.
      </p>
      {savedGoalDescription && <p className={styles.savedValue}>{savedGoalDescription}</p>}
      <ul className={styles.steps}>
        <li>
          <div>
            <h3>Daily nutrient goals</h3>
            <p>
              {hasConfiguredGoals
                ? 'A current goal is saved.'
                : 'Add goals only when you want comparisons.'}
            </p>
          </div>
          {canManageGoals ? (
            <button type="button" onClick={onConfigureGoals}>
              {hasConfiguredGoals ? 'Review goals' : 'Set daily nutrition goal'}
            </button>
          ) : (
            <span>Goal changes are unavailable.</span>
          )}
          <SetupStatus complete={hasConfiguredGoals} />
        </li>
        <li>
          <div>
            <h3>Food diary</h3>
            <p>
              {hasDiaryEntries
                ? 'Confirmed food is recorded.'
                : 'Record food independently of goals or measurements.'}
            </p>
          </div>
          {canManageProfile && (
            <button type="button" onClick={onRecordNutrition}>
              Log food
            </button>
          )}
          <SetupStatus complete={hasDiaryEntries} />
        </li>
        <li>
          <div>
            <h3>Personal planned portions</h3>
            <p>
              {hasPlannedMeals
                ? 'A personal portion is saved.'
                : 'Assign a personal portion to preview planned nutrition.'}
            </p>
          </div>
          <Link className="inline-link" href="/nutrition?view=overview&portions=1#planned-portions">
            View planned portions
          </Link>
          <SetupStatus complete={hasPlannedMeals} />
        </li>
      </ul>
      <Link className="inline-link" href="/account/nutrition">
        Review Nutrition preferences
      </Link>
    </div>
  );
}
