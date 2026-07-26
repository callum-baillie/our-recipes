'use client';

import { ArrowRight, Check, Circle, ClipboardCheck, Scale, Target, Utensils } from 'lucide-react';
import Link from 'next/link';

import styles from '@/components/nutrition-setup-overview.module.css';
import type { NutritionWeightTrend } from '@/lib/domain/nutrition-weight-trend';

type NutritionSetupOverviewProps = {
  profileName: string;
  canManageGoals: boolean;
  canManageProfile: boolean;
  hasDiaryEntries: boolean;
  hasPlannedMeals: boolean;
  weightTrend?: NutritionWeightTrend | null;
  onRecordNutrition: () => void;
  onRecordWeight: () => void;
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
            <Link href="/settings/nutrition#weight-tracking">
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
  canManageGoals,
  canManageProfile,
  hasDiaryEntries,
  hasPlannedMeals,
  weightTrend,
  onRecordNutrition,
  onRecordWeight,
}: NutritionSetupOverviewProps) {
  const completedSteps = Number(hasDiaryEntries) + Number(hasPlannedMeals);

  return (
    <div className={styles.setup}>
      <section className={styles.setupHero} aria-labelledby="nutrition-setup-title">
        <div className={styles.heroIcon}>
          <Target size={26} aria-hidden="true" />
        </div>
        <div>
          <p className={styles.eyebrow}>Nutrition setup</p>
          <h2 id="nutrition-setup-title">Build a useful nutrition baseline</h2>
          <p>
            Set goals for {profileName}, then record food or connect planned meals. Bòrd only shows
            progress when it has goals and confirmed data to compare.
          </p>
        </div>
        <span className={styles.progressLabel}>{completedSteps} of 3 steps complete</span>
      </section>

      <section className={styles.steps} aria-label="Nutrition setup steps">
        <article className={styles.primaryStep}>
          <span className={styles.stepNumber}>1</span>
          <span className={styles.stepIcon}>
            <Target size={20} aria-hidden="true" />
          </span>
          <div>
            <span className={styles.stepEyebrow}>Start here</span>
            <h3>Choose goals and preferences</h3>
            <p>
              Add calorie or nutrient targets, units, dietary context, and optional estimated-target
              settings.
            </p>
            {canManageGoals ? (
              <Link href="/settings/nutrition#nutrition-goals">
                Set up nutrition goals <ArrowRight size={15} aria-hidden="true" />
              </Link>
            ) : (
              <span className={styles.unavailable}>
                Goal settings are not available for this profile.
              </span>
            )}
          </div>
          <SetupStatus complete={false} />
        </article>

        <article>
          <span className={styles.stepNumber}>2</span>
          <span className={styles.stepIcon}>
            <Utensils size={20} aria-hidden="true" />
          </span>
          <div>
            <h3>Record what you eat</h3>
            <p>Confirmed foods and meals build your diary without treating plans as consumption.</p>
            {canManageProfile ? (
              <button type="button" onClick={onRecordNutrition}>
                Record nutrition <ArrowRight size={15} aria-hidden="true" />
              </button>
            ) : null}
          </div>
          <SetupStatus complete={hasDiaryEntries} />
        </article>

        <article>
          <span className={styles.stepNumber}>3</span>
          <span className={styles.stepIcon}>
            <ClipboardCheck size={20} aria-hidden="true" />
          </span>
          <div>
            <h3>Connect your meal plan</h3>
            <p>
              Planned portions stay separate, but help preview how the week supports your goals.
            </p>
            <Link href="/planner">
              Open meal planner <ArrowRight size={15} aria-hidden="true" />
            </Link>
          </div>
          <SetupStatus complete={hasPlannedMeals} />
        </article>
      </section>

      <NutritionWeightTrackerCard
        canManageProfile={canManageProfile}
        weightTrend={weightTrend}
        onRecordWeight={onRecordWeight}
      />

      <section className={styles.explainer} aria-labelledby="nutrition-setup-explainer">
        <h2 id="nutrition-setup-explainer">What you will see after setup</h2>
        <div>
          <span>
            <strong>Daily progress</strong>
            Confirmed food compared with goals you chose.
          </span>
          <span>
            <strong>Plan preview</strong>
            Planned meals shown separately from food you actually ate.
          </span>
          <span>
            <strong>Trends with context</strong>
            Charts appear only after enough reliable observations exist.
          </span>
        </div>
      </section>
    </div>
  );
}
