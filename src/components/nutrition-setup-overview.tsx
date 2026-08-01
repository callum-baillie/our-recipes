'use client';

import { ArrowRight, Check, Circle, ClipboardCheck, Scale, Target, Utensils } from 'lucide-react';
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
  hasConfiguredGoals,
  canManageGoals,
  canManageProfile,
  hasDiaryEntries,
  hasPlannedMeals,
  savedGoalDescription,
  weightTrend,
  onRecordNutrition,
  onRecordWeight,
  onConfigureGoals,
}: NutritionSetupOverviewProps) {
  const completedSteps =
    1 + Number(hasConfiguredGoals) + Number(hasDiaryEntries) + Number(hasPlannedMeals);
  const nextStep = !hasConfiguredGoals
    ? {
        title: 'Choose a daily nutrition goal',
        detail: 'Set a calorie or nutrient goal before Bòrd can compare recorded nutrition.',
        href: null,
        label: 'Set daily nutrition goal',
      }
    : !hasDiaryEntries
      ? {
          title: 'Record what you eat',
          detail: 'Confirm a food or meal to start your diary.',
          href: null,
          label: 'Record nutrition',
        }
      : !hasPlannedMeals
        ? {
            title: 'Connect your meal plan',
            detail: 'Assign a planned meal when you want a separate weekly preview.',
            href: '/planner',
            label: 'Open meal planner',
          }
        : null;

  return (
    <div className={styles.setup}>
      <section className={styles.setupHero} aria-labelledby="nutrition-setup-title">
        <div className={styles.heroIcon}>
          <Target size={26} aria-hidden="true" />
        </div>
        <div>
          <p className={styles.eyebrow}>{nextStep ? `Next: ${nextStep.title}` : 'Nutrition baseline ready'}</p>
          <h2 id="nutrition-setup-title">
            {nextStep ? 'Continue your nutrition setup' : 'Your nutrition baseline is ready'}
          </h2>
          <p>
            {profileName}&apos;s Nutrition profile is saved. Each item below is optional and has its
            own completion action, so you can return exactly where you left off.
          </p>
          {nextStep ? (
            nextStep.href ? (
              <Link className={styles.heroAction} href={nextStep.href}>
                {nextStep.label} <ArrowRight size={15} aria-hidden="true" />
              </Link>
            ) : nextStep.title === 'Choose a daily nutrition goal' && canManageGoals ? (
              <button className={styles.heroAction} type="button" onClick={onConfigureGoals}>
                {nextStep.label} <ArrowRight size={15} aria-hidden="true" />
              </button>
            ) : canManageProfile ? (
              <button className={styles.heroAction} type="button" onClick={onRecordNutrition}>
                {nextStep.label} <ArrowRight size={15} aria-hidden="true" />
              </button>
            ) : null
          ) : null}
        </div>
        <span className={styles.progressLabel}>{completedSteps} of 4 steps complete</span>
      </section>

      <section className={styles.steps} aria-label="Nutrition setup steps">
        <article className={styles.primaryStep}>
          <span className={styles.stepNumber}>1</span>
          <span className={styles.stepIcon}>
            <Target size={20} aria-hidden="true" />
          </span>
          <div>
            <span className={styles.stepEyebrow}>Complete</span>
            <h3>Nutrition profile saved</h3>
            <p>
              Body, preference, and body-weight direction settings from onboarding are saved for{' '}
              {profileName}.
            </p>
            {savedGoalDescription ? <p className={styles.savedValue}>{savedGoalDescription}</p> : null}
            <Link href="/settings/nutrition">
              Review Nutrition profile <ArrowRight size={15} aria-hidden="true" />
            </Link>
          </div>
          <SetupStatus complete />
        </article>

        <article>
          <span className={styles.stepNumber}>2</span>
          <span className={styles.stepIcon}>
            <Utensils size={20} aria-hidden="true" />
          </span>
          <div>
            <h3>Choose a daily nutrition goal</h3>
            <p>
              Add a manual calorie or nutrient goal, or review and apply an estimated maintenance
              target. This is separate from your saved weight direction.
            </p>
            {canManageGoals ? (
              <button type="button" onClick={onConfigureGoals}>
                Set up daily nutrition goals <ArrowRight size={15} aria-hidden="true" />
              </button>
            ) : (
              <span className={styles.unavailable}>
                Goal settings are not available for this profile.
              </span>
            )}
          </div>
          <SetupStatus complete={hasConfiguredGoals} />
        </article>

        <article>
          <span className={styles.stepNumber}>3</span>
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
          <span className={styles.stepNumber}>4</span>
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
