'use client';

import { useLayoutEffect, useRef, useState, type FormEvent } from 'react';
import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { ChevronDown, X } from 'lucide-react';
import { AppDialog } from './app-dialog';
import { NutritionFeedback } from './nutrition-form-fields';
import { useNutritionDraft } from './use-nutrition-draft';
import { useNutritionRequest } from './use-nutrition-request';
import { createClientUuid } from '@/lib/client/client-uuid';
import { displayNutritionWeight } from '@/lib/domain/nutrition-ui';
import type {
  Goal,
  NutrientDefinition,
  NutritionGoalSetup,
  ProfileSummary,
} from './nutrition-dashboard';
import styles from './nutrition-dashboard.module.css';

type Estimate = {
  roundedKcal: number;
  sourceVersion?: string;
  disclosure?: string;
  palCategory: string;
  effectiveOn: string;
  profileVersion: number;
  pace: string;
  direction: string;
};

export function NutritionGoalDialog({
  open,
  onClose,
  profile,
  definitions,
  goals,
  goalSetup,
  today,
  onSaved,
}: {
  open: boolean;
  onClose: () => void;
  profile: ProfileSummary;
  definitions: NutrientDefinition[];
  goals: Goal[];
  goalSetup?: NutritionGoalSetup | null;
  today: string;
  onSaved: (message: string) => void;
}) {
  const router = useRouter();
  const { draft, update, clear, notice, dirty } = useNutritionDraft(`${profile.id}:goals`, {
    editingId: '',
    nutrientCode: 'energy_kcal',
    kind: 'target',
    value: '',
    minimum: '',
    maximum: '',
    startsOn: today,
    endsOn: '',
    pal: 'low_active',
    pace: 'gradual',
    origin: 'manual',
    operationId: '',
    separate: '',
    uncertain: '',
  });
  const request = useNutritionRequest(`${profile.id}:goals`);
  const [estimate, setEstimate] = useState<Estimate | null>(null);
  const estimateSequence = useRef(0);
  const previewRef = useRef<HTMLDivElement>(null);
  const estimateBasis = `${profile.id}:${goalSetup?.profileVersion}:${draft.startsOn}:${draft.pal}:${draft.pace}:${goalSetup?.nutritionGoalType}`;
  const currentBasis = useRef(estimateBasis);
  useLayoutEffect(() => {
    currentBasis.current = estimateBasis;
  }, [estimateBasis]);
  const selectedGoal = goals.find((goal) => goal.id === draft.editingId);
  const nutrient = definitions.find((definition) => definition.code === draft.nutrientCode);
  const currentGoals = goals.filter(
    (goal) =>
      goal.nutrientCode === draft.nutrientCode &&
      goal.state === 'active' &&
      (goal.startsOn ?? today) <= draft.startsOn &&
      (!goal.endsOn || goal.endsOn >= draft.startsOn),
  );
  const adjustment =
    (draft.pace === 'steady' ? 500 : 250) * (goalSetup?.nutritionGoalType === 'loss' ? -1 : 1);
  const estimateCurrent = Boolean(
    estimate &&
    estimate.profileVersion === goalSetup?.profileVersion &&
    estimate.palCategory === draft.pal &&
    estimate.effectiveOn === draft.startsOn &&
    estimate.pace === draft.pace &&
    estimate.direction === goalSetup?.nutritionGoalType,
  );
  const adjustedTarget = estimate ? estimate.roundedKcal + adjustment : null;
  const canUseDirection =
    goalSetup?.nutritionGoalType === 'loss' || goalSetup?.nutritionGoalType === 'gain';
  const validEstimatedDraft =
    draft.origin !== 'estimate' ||
    (estimateCurrent &&
      Number(draft.value) === adjustedTarget &&
      draft.nutrientCode === 'energy_kcal' &&
      draft.kind === 'target');
  function change(patch: Partial<typeof draft>) {
    update({ ...patch, operationId: '' });
  }
  function selectGoal(id: string) {
    const goal = goals.find((item) => item.id === id);
    change(
      goal
        ? {
            editingId: id,
            origin: 'manual',
            nutrientCode: goal.nutrientCode,
            kind: goal.kind,
            value: goal.value?.toString() ?? '',
            minimum: goal.minimum?.toString() ?? '',
            maximum: goal.maximum?.toString() ?? '',
            startsOn: goal.startsOn ?? today,
            endsOn: goal.endsOn ?? '',
            separate: '',
          }
        : {
            editingId: '',
            origin: 'manual',
            value: '',
            minimum: '',
            maximum: '',
            startsOn: today,
            endsOn: '',
            separate: '',
          },
    );
  }
  function dismiss() {
    if (request.pending) return;
    if (
      dirty &&
      !window.confirm(
        'Close goal setup? Your draft is kept in this tab; it has not been saved as a goal.',
      )
    )
      return;
    estimateSequence.current++;
    setEstimate(null);
    onClose();
  }
  async function preview() {
    if (!goalSetup || request.isPending()) return;
    const sequence = ++estimateSequence.current;
    const basis = estimateBasis;
    const result = await request.send<{
      estimate?: {
        roundedKcal: number;
        sourceVersion?: string;
        disclosure?: string;
        palCategory: string;
        effectiveOn: string;
      };
    }>(
      'estimate',
      `/api/v1/nutrition/profiles/${profile.id}/goals/estimate`,
      {
        action: 'preview',
        expectedProfileVersion: goalSetup.profileVersion,
        effectiveOn: draft.startsOn,
        palCategory: draft.pal,
      },
      { readOnly: true, pending: 'Calculating preview…' },
    );
    if (sequence !== estimateSequence.current || basis !== currentBasis.current) return;
    if (result?.estimate) {
      setEstimate({
        ...result.estimate,
        profileVersion: goalSetup.profileVersion,
        pace: draft.pace,
        direction: goalSetup.nutritionGoalType,
      });
      request.message(
        'estimate',
        'success',
        'Preview ready. Review its inputs and draft target before saving.',
      );
      window.requestAnimationFrame(() => {
        previewRef.current?.focus({ preventScroll: true });
        previewRef.current?.scrollIntoView({ block: 'nearest' });
      });
    }
  }
  async function save(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (
      !profile.canManageGoals ||
      request.isPending() ||
      (draft.uncertain && draft.origin !== 'estimate')
    )
      return;
    if (!validEstimatedDraft) {
      request.message(
        'goal',
        'error',
        'This estimate is no longer current. Recalculate, or explicitly choose a manual goal.',
      );
      return;
    }
    if (!selectedGoal && currentGoals.length && (!draft.separate || draft.origin === 'estimate')) {
      request.message(
        'goal',
        'error',
        'Edit the existing goal, or confirm that you want a separate goal series.',
      );
      return;
    }
    if (draft.kind === 'range' && Number(draft.maximum) < Number(draft.minimum)) {
      request.message('goal', 'error', 'The range maximum must be at least its minimum.');
      return;
    }
    const operationId = draft.operationId || createClientUuid();
    update({ operationId });
    let endpoint = `/api/v1/nutrition/profiles/${profile.id}/goals`;
    let body: object;
    if (draft.origin === 'estimate') {
      endpoint += '/estimate';
      body = {
        action: 'apply',
        expectedProfileVersion: goalSetup!.profileVersion,
        effectiveOn: draft.startsOn,
        palCategory: draft.pal,
        operationId,
        supersedesGoalVersionId: selectedGoal?.id ?? null,
        planningAdjustmentKcal: adjustment,
        reviewedTargetKcal: Number(draft.value),
      };
    } else
      body = {
        goal: {
          nutrientCode: draft.nutrientCode,
          unit: nutrient?.canonicalUnit ?? selectedGoal?.unit,
          sourceType: 'user_defined',
          startsOn: draft.startsOn,
          endsOn: draft.endsOn || null,
          kind: draft.kind,
          ...(draft.kind === 'range'
            ? { minimum: Number(draft.minimum), maximum: Number(draft.maximum) }
            : draft.kind === 'limit'
              ? { maximum: Number(draft.maximum) }
              : { value: Number(draft.value) }),
        },
        ...(selectedGoal
          ? { seriesId: selectedGoal.seriesId, supersedesGoalVersionId: selectedGoal.id }
          : {}),
      };
    const result = await request.send<{ goal: { revision: number } }>('goal', endpoint, body, {
      replay: draft.origin === 'estimate',
      pending: 'Saving goal…',
    });
    if (!result) {
      if (request.isUncertain('goal')) update({ uncertain: 'yes' });
      return;
    }
    const message = `${nutrient?.displayName ?? draft.nutrientCode} goal saved for ${profile.displayName}, effective ${draft.startsOn}${result.goal?.revision ? ` · revision ${result.goal.revision}` : ''}.`;
    request.message('goal', 'success', message);
    onSaved(message);
    clear();
    setEstimate(null);
    router.refresh();
  }
  if (!open) return null;
  return (
    <AppDialog
      className={styles.goalDialog}
      aria-labelledby="nutrition-goal-setup-title"
      onClose={dismiss}
    >
      <header className={styles.dialogHeader}>
        <div>
          <h2 id="nutrition-goal-setup-title">Nutrition goals</h2>
          <p>
            {profile.displayName} · Goals are optional; recording food remains useful without them.
          </p>
        </div>
        <button
          type="button"
          className={styles.iconButton}
          aria-label="Close daily nutrition goal setup"
          onClick={dismiss}
          disabled={request.pending}
        >
          <X size={20} />
        </button>
      </header>
      <form className={styles.recordForm} onSubmit={save}>
        <div className={styles.dialogBody}>
          {notice && (
            <p className={styles.helper} role="status">
              {notice}
            </p>
          )}
          <fieldset
            className={styles.formFields}
            disabled={request.pending || !profile.canManageGoals || Boolean(draft.uncertain)}
          >
            <label>
              Goal to change
              <select value={draft.editingId} onChange={(event) => selectGoal(event.target.value)}>
                <option value="">Add a separate goal</option>
                {goals.map((goal) => (
                  <option key={goal.id} value={goal.id}>
                    {definitions.find((item) => item.code === goal.nutrientCode)?.displayName ??
                      goal.nutrientCode}{' '}
                    · {goal.kind} · {goal.startsOn ?? 'saved'} · revision {goal.revision ?? 1}
                  </option>
                ))}
              </select>
            </label>
            <p className={styles.helper}>
              {selectedGoal
                ? `Editing this exact saved version creates its next revision and preserves history.`
                : 'Adding creates a new goal series. Choose an existing goal above to edit it instead.'}
            </p>
            {draft.origin === 'estimate' && (
              <div className={styles.feedback} role="status">
                <p>
                  {validEstimatedDraft
                    ? 'This draft uses the reviewed estimate and saved profile version.'
                    : 'The estimate basis or value changed. Recalculate and use the reviewed draft, or deliberately convert these values to a manual goal.'}
                </p>
                <button type="button" onClick={() => change({ origin: 'manual' })}>
                  Convert this draft to a manual goal
                </button>
              </div>
            )}
            <div className={styles.formGrid}>
              <label>
                Nutrient
                <select
                  value={draft.nutrientCode}
                  onChange={(event) =>
                    change({
                      nutrientCode: event.target.value,
                      value: '',
                      minimum: '',
                      maximum: '',
                    })
                  }
                >
                  {definitions.map((item) => (
                    <option key={item.code} value={item.code}>
                      {item.displayName} ({item.canonicalUnit})
                    </option>
                  ))}
                </select>
              </label>
              <label>
                Goal type
                <select
                  value={draft.kind}
                  onChange={(event) => change({ kind: event.target.value })}
                >
                  {['target', 'minimum', 'range', 'limit'].map((kind) => (
                    <option key={kind} value={kind}>
                      {kind.charAt(0).toUpperCase() + kind.slice(1)}
                    </option>
                  ))}
                </select>
              </label>
            </div>
            <div className={styles.formGrid}>
              {draft.kind === 'range' ? (
                <>
                  <label>
                    Minimum ({nutrient?.canonicalUnit})
                    <input
                      type="number"
                      min="0.000001"
                      step="any"
                      value={draft.minimum}
                      onChange={(event) => change({ minimum: event.target.value })}
                      required
                    />
                  </label>
                  <label>
                    Maximum ({nutrient?.canonicalUnit})
                    <input
                      type="number"
                      min={draft.minimum || '0.000001'}
                      step="any"
                      value={draft.maximum}
                      onChange={(event) => change({ maximum: event.target.value })}
                      required
                    />
                  </label>
                </>
              ) : (
                <label>
                  {draft.kind === 'limit' ? 'Upper limit' : 'Value'} ({nutrient?.canonicalUnit})
                  <input
                    type="number"
                    min="0.000001"
                    step="any"
                    value={draft.kind === 'limit' ? draft.maximum : draft.value}
                    onChange={(event) =>
                      change(
                        draft.kind === 'limit'
                          ? { maximum: event.target.value }
                          : { value: event.target.value },
                      )
                    }
                    required
                  />
                </label>
              )}
            </div>
            <div className={styles.formGrid}>
              <label>
                Effective from
                <input
                  type="date"
                  value={draft.startsOn}
                  onChange={(event) => change({ startsOn: event.target.value })}
                  required
                />
              </label>
              <label>
                End date (optional)
                <input
                  type="date"
                  min={draft.startsOn}
                  value={draft.endsOn}
                  onChange={(event) => change({ endsOn: event.target.value })}
                />
              </label>
            </div>
            {!selectedGoal && currentGoals.length > 0 && (
              <label className={styles.checkRow}>
                <input
                  type="checkbox"
                  checked={draft.separate === 'yes'}
                  onChange={(event) => change({ separate: event.target.checked ? 'yes' : '' })}
                  required
                />
                I want a separate goal as well as the {currentGoals.length} current{' '}
                {draft.nutrientCode} {currentGoals.length === 1 ? 'goal' : 'goals'}. Comparisons may
                be ambiguous.
              </label>
            )}
            <details>
              <summary className="recipe-disclosure-summary">
                Example starting points
                <ChevronDown size={18} />
              </summary>
              <p className={styles.helper}>
                Examples populate an editable draft. Selecting one does not save a goal.
              </p>
              <div className={styles.buttonRow}>
                {[1800, 2000, 2200].map((value) => (
                  <button
                    type="button"
                    key={value}
                    onClick={() => {
                      const energy = goals.filter(
                        (goal) =>
                          goal.nutrientCode === 'energy_kcal' &&
                          goal.state === 'active' &&
                          (goal.startsOn ?? today) <= draft.startsOn &&
                          (!goal.endsOn || goal.endsOn >= draft.startsOn),
                      );
                      change({
                        origin: 'manual',
                        nutrientCode: 'energy_kcal',
                        kind: 'target',
                        value: String(value),
                        editingId: energy.length === 1 ? energy[0]!.id : '',
                        minimum: '',
                        maximum: '',
                        separate: '',
                      });
                    }}
                  >
                    Use {value.toLocaleString()} kcal draft
                  </button>
                ))}
              </div>
            </details>
            {canUseDirection && (
              <details>
                <summary className="recipe-disclosure-summary">
                  Review an estimate from the saved weight direction
                  <ChevronDown size={18} />
                </summary>
                <p className={styles.helper}>
                  {goalSetup?.currentWeightKilograms != null
                    ? displayNutritionWeight(
                        goalSetup.currentWeightKilograms,
                        profile.measurementSystem === 'imperial',
                      )
                    : ''}
                  {goalSetup?.targetWeightKilograms != null
                    ? ` to ${displayNutritionWeight(goalSetup.targetWeightKilograms, profile.measurementSystem === 'imperial')}`
                    : ''}{' '}
                  · {goalSetup?.nutritionGoalType}. This direction is separate from a daily nutrient
                  goal.
                </p>
                <div className={styles.formGrid}>
                  <label>
                    Activity for this estimate
                    <select
                      value={draft.pal}
                      onChange={(event) => change({ pal: event.target.value })}
                    >
                      <option value="inactive">Mostly sitting</option>
                      <option value="low_active">Light daily movement</option>
                      <option value="active">Active most days</option>
                      <option value="very_active">Very active</option>
                    </select>
                  </label>
                  <label>
                    Planning adjustment
                    <select
                      value={draft.pace}
                      onChange={(event) => change({ pace: event.target.value })}
                    >
                      <option value="gradual">Gradual · 250 kcal/day</option>
                      <option value="steady">Steady · 500 kcal/day</option>
                    </select>
                  </label>
                </div>
                <p className={styles.helper}>
                  Selected:{' '}
                  {
                    (
                      {
                        inactive: 'Mostly sitting',
                        low_active: 'Light daily movement',
                        active: 'Active most days',
                        very_active: 'Very active',
                      } as Record<string, string>
                    )[draft.pal]
                  }{' '}
                  · {draft.pace === 'steady' ? 'Steady: 500 kcal/day' : 'Gradual: 250 kcal/day'}{' '}
                  adjustment.
                </p>
                <p className={styles.helper}>
                  Uses optional body inputs, explicit activity and estimated-target consent.{' '}
                  <Link className="inline-link" href="/account/nutrition">
                    Review Nutrition settings
                  </Link>
                  .
                </p>
                <button
                  type="button"
                  disabled={!draft.startsOn || request.pending}
                  onClick={() => void preview()}
                >
                  Calculate a planning preview
                </button>
                <NutritionFeedback value={request.feedback.estimate} />
                {estimate && (
                  <div ref={previewRef} tabIndex={-1} className={styles.identity}>
                    <strong>
                      {estimate.roundedKcal.toLocaleString()} kcal/day estimated maintenance
                    </strong>
                    <span>
                      Profile version {estimate.profileVersion} · {estimate.effectiveOn} ·{' '}
                      {estimate.palCategory.replaceAll('_', ' ')} · {estimate.pace} adjustment
                    </span>
                    {!estimateCurrent ? (
                      <p role="status">Inputs changed. Recalculate before using this estimate.</p>
                    ) : adjustedTarget !== null && adjustedTarget >= 1200 ? (
                      <>
                        <span>
                          Reviewed draft: {adjustedTarget.toLocaleString()} kcal/day (
                          {adjustment > 0 ? '+' : ''}
                          {adjustment} kcal/day from maintenance).
                        </span>
                        <button
                          type="button"
                          onClick={() => {
                            const energy = goals.filter(
                              (goal) =>
                                goal.nutrientCode === 'energy_kcal' &&
                                goal.state === 'active' &&
                                (goal.startsOn ?? today) <= draft.startsOn &&
                                (!goal.endsOn || goal.endsOn >= draft.startsOn),
                            );
                            update({
                              origin: 'estimate',
                              nutrientCode: 'energy_kcal',
                              kind: 'target',
                              value: String(adjustedTarget),
                              editingId: energy.length === 1 ? energy[0]!.id : '',
                              endsOn: '',
                              operationId: '',
                              separate: '',
                            });
                          }}
                        >
                          Use reviewed estimate in the draft
                        </button>
                      </>
                    ) : (
                      <p>
                        This adjustment would produce a target below the existing 1,200 kcal/day
                        boundary; Bòrd will not save it.
                      </p>
                    )}
                    <small>
                      {estimate.sourceVersion}. Estimates do not diagnose or prescribe individual
                      requirements.
                    </small>
                  </div>
                )}
              </details>
            )}
            {draft.origin === 'estimate' && (
              <div ref={previewRef} tabIndex={-1} className={styles.identity}>
                {validEstimatedDraft
                  ? 'This draft retains the reviewed estimate, adjustment and profile-version evidence. Save goal applies it after server revalidation.'
                  : 'The estimate is no longer current. Recalculate before saving, or choose a manual goal.'}
                <button type="button" onClick={() => change({ origin: 'manual' })}>
                  Use these values as a manual goal
                </button>
              </div>
            )}
          </fieldset>
          <details>
            <summary className="recipe-disclosure-summary">
              Saved goal versions
              <ChevronDown size={18} />
            </summary>
            {goals.length ? (
              <ul className={styles.goalList}>
                {goals.map((goal) => (
                  <li key={goal.id}>
                    <strong>
                      {definitions.find((item) => item.code === goal.nutrientCode)?.displayName ??
                        goal.nutrientCode}
                    </strong>
                    <span>
                      {goal.kind === 'range'
                        ? `${goal.minimum}–${goal.maximum}`
                        : goal.kind === 'limit'
                          ? goal.maximum
                          : goal.value}{' '}
                      {goal.unit} · {goal.kind} · {goal.state} · {goal.startsOn ?? 'saved'}
                      {goal.endsOn ? ` to ${goal.endsOn}` : ''}
                    </span>
                  </li>
                ))}
              </ul>
            ) : (
              <p className={styles.helper}>
                No saved nutrient goals. Recorded amounts can still be shown without comparisons.
              </p>
            )}
          </details>
        </div>
        <footer className={styles.dialogFooter}>
          <NutritionFeedback value={request.feedback.goal} />
          {draft.uncertain && (
            <button
              type="button"
              onClick={() => {
                if (
                  window.confirm(
                    'Only start a new goal after checking the saved history for the earlier request.',
                  )
                ) {
                  clear();
                  window.location.reload();
                }
              }}
            >
              Start fresh after checking saved goals
            </button>
          )}
          {draft.uncertain && (
            <Link className="inline-link" href="/nutrition" target="_blank">
              Check saved goals before refreshing this form
            </Link>
          )}
          <div className={styles.buttonRow}>
            <button type="button" onClick={dismiss} disabled={request.pending}>
              Close goal setup
            </button>
            <button
              className={styles.primaryAction}
              type="submit"
              disabled={
                request.pending ||
                !profile.canManageGoals ||
                !validEstimatedDraft ||
                (Boolean(draft.uncertain) && draft.origin !== 'estimate')
              }
            >
              {request.busyTask === 'goal'
                ? 'Saving goal…'
                : draft.uncertain
                  ? 'Retry same goal'
                  : 'Save goal'}
            </button>
          </div>
        </footer>
      </form>
    </AppDialog>
  );
}
