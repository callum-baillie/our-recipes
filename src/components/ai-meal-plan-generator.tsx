'use client';

import {
  ArrowLeft,
  BookOpen,
  CalendarDays,
  Check,
  LockKeyhole,
  Sparkles,
  UsersRound,
  Utensils,
  X,
} from 'lucide-react';
import Link from 'next/link';
import { mealTypeLabel, type MealTypeOption } from './meal-planner-types';
import { AppDialog } from './app-dialog';
import { effectivePlanEntries } from '@/lib/domain/planner-workflow';
import { formatRecipeDuration } from '@/lib/domain/recipe-duration';
import type { RecipePayload } from '@/lib/domain/recipe';
import { useEffect, useId, useMemo, useRef, useState } from 'react';

import { AsyncSkeleton, LoadingIndicator } from '@/components/skeleton';
import {
  AI_PRICING_AS_OF,
  estimateAiMealPlanCost,
  type AiMealPlanCostEstimate,
} from '@/lib/domain/ai-cost-estimate';

import styles from './ai-meal-plan-generator.module.css';

type PlannerProfile = { id: string; displayName: string; nutritionReady?: boolean };
type MealPlanEntryPreview = {
  entryKey?: string;
  plannedFor: string;
  meal: string;
  existingRecipeId: string | null;
  newRecipeKey: string | null;
  title: string;
  servings: number;
  note: string;
};
type MealPlanConflict = {
  entryId: string;
  plannedFor: string;
  meal: string;
  title: string;
};
type MealPlanProposal = {
  id: string;
  status: string;
  preview: {
    request: {
      mode: 'recipebook' | 'ai';
      startDate: string;
      endDate: string;
      mealSlots: string[];
      options?: { generateRecipeImages?: boolean };
    };
    selectedProfileIds: string[];
    candidate: {
      newRecipes: Array<{ key: string; recipe: RecipePayload }>;
      entries: MealPlanEntryPreview[];
      allocations: Array<{ entryKey: string; householdProfileId: string; servings: number }>;
      leftoverLinks: Array<{ sourceEntryKey: string; destinationEntryKey: string }>;
      warnings: string[];
      assumptions: string[];
    };
    conflicts: MealPlanConflict[];
  };
};

type GenerationOptions = {
  followNutrition: boolean;
  generateMissingRecipes: boolean;
  easyGroceryList: boolean;
  allowRepeatingMeals: boolean;
  planLeftovers: boolean;
  generateRecipeImages: boolean;
};

const DEFAULT_OPTIONS: GenerationOptions = {
  followNutrition: true,
  generateMissingRecipes: false,
  easyGroceryList: true,
  allowRepeatingMeals: false,
  planLeftovers: false,
  generateRecipeImages: false,
};

function estimatedUsd(value: number | null): string {
  if (value === null) return 'Unavailable';
  const safeValue = Math.max(0, value);
  if (safeValue === 0) return '$0.00';
  if (safeValue < 0.01) return 'Less than $0.01';
  return `About $${safeValue.toFixed(2)}`;
}

async function responseError(response: Response) {
  const body = (await response.json().catch(() => null)) as { error?: { message?: string } } | null;
  return body?.error?.message ?? 'The meal plan could not be generated.';
}

function shortDate(value: string): string {
  return new Intl.DateTimeFormat('en-US', {
    month: 'short',
    day: 'numeric',
    year: 'numeric',
  }).format(new Date(`${value}T12:00:00Z`));
}

function recipeTiming(recipe: RecipePayload) {
  return (
    (
      [
        ['Prep', recipe.prepMinutes],
        ['Cook', recipe.cookMinutes],
        ['Rest', recipe.restMinutes],
      ] as const
    )
      .flatMap(([label, minutes]) => {
        const duration = formatRecipeDuration(minutes);
        return duration ? [`${label} ${duration}`] : [];
      })
      .join(' · ') || 'Time not provided'
  );
}

function Toggle({
  label,
  description,
  checked,
  disabled,
  onChange,
}: {
  label: string;
  description?: string;
  checked: boolean;
  disabled?: boolean;
  onChange: (checked: boolean) => void;
}) {
  return (
    <label className={`${styles.toggle}${disabled ? ` ${styles.toggleDisabled}` : ''}`}>
      <span>
        <strong>{label}</strong>
        {description ? <small>{description}</small> : null}
      </span>
      <input
        type="checkbox"
        role="switch"
        checked={checked}
        disabled={disabled}
        onChange={(event) => onChange(event.target.checked)}
      />
      <i aria-hidden="true" />
    </label>
  );
}

function ModeOptions({
  mode,
  options,
  nutritionReady,
  busy,
  imageGenerationEnabled,
  costEstimate,
  onOptions,
  onGenerate,
}: {
  mode: 'recipebook' | 'ai';
  options: GenerationOptions;
  nutritionReady: boolean;
  busy: boolean;
  imageGenerationEnabled: boolean;
  costEstimate?: AiMealPlanCostEstimate;
  onOptions: (next: GenerationOptions) => void;
  onGenerate: () => void;
}) {
  const recipebook = mode === 'recipebook';
  const set = (key: keyof GenerationOptions, value: boolean) =>
    onOptions({ ...options, [key]: value });
  return (
    <article className={styles.modeCard}>
      <div className={styles.modeHeading}>
        <span>{recipebook ? <BookOpen /> : <Sparkles />}</span>
        <div>
          <h3>{recipebook ? 'Use saved recipes' : 'Create new recipes with AI'}</h3>
          <p>
            {recipebook
              ? 'Automatically fill selected meal slots with trusted saved recipes.'
              : 'Prepare new recipes for these people and dates. Review before saving.'}
          </p>
          {(!recipebook || options.generateMissingRecipes) && costEstimate ? (
            <div className={styles.costEstimate} aria-label="Estimated AI API cost">
              <div>
                <span>{recipebook ? 'Conditional AI fallback' : 'Estimated cost'}</span>
                <strong>{estimatedUsd(costEstimate.totalUsd)}</strong>
              </div>
              <details>
                <summary>Cost details</summary>
                <dl>
                  <div>
                    <dt>{costEstimate.mealPlanRequestCount} plan request</dt>
                    <dd>
                      {costEstimate.recipeCount} recipe{costEstimate.recipeCount === 1 ? '' : 's'}
                    </dd>
                  </div>
                  <div>
                    <dt>Input</dt>
                    <dd>{estimatedUsd(costEstimate.inputUsd)}</dd>
                  </div>
                  <div>
                    <dt>Output</dt>
                    <dd>{estimatedUsd(costEstimate.outputUsd)}</dd>
                  </div>
                  <div>
                    <dt>
                      {costEstimate.imageCount} image{costEstimate.imageCount === 1 ? '' : 's'}
                    </dt>
                    <dd>{estimatedUsd(costEstimate.imageUsd)}</dd>
                  </div>
                </dl>
                <small>
                  {costEstimate.recipeCountIsEstimate
                    ? 'Recipe and image counts are estimates because repeating meals are allowed. '
                    : 'Recipe and image counts match the selected meal slots and leftovers. '}
                  Model-based estimate, including selected images · pricing model dated{' '}
                  {AI_PRICING_AS_OF}
                  {costEstimate.imageBatchApplied
                    ? ' · Batch pricing is applied to four or more recipe images.'
                    : ''}
                </small>
              </details>
              {recipebook ? (
                <p>
                  No paid request when saved recipes fill every slot. Otherwise, cost depends on the
                  gaps; the estimate above models a full request, not a guaranteed charge.
                </p>
              ) : null}
            </div>
          ) : null}
        </div>
      </div>
      <fieldset className={styles.toggleList} disabled={busy}>
        <Toggle
          label={recipebook ? 'Prefer recipes with nutrition data' : 'Use shared nutrition goals'}
          description={
            nutritionReady
              ? recipebook
                ? 'Ranks saved recipes with calorie data; does not match individual targets.'
                : 'Uses permitted goals for the selected people; estimates need review.'
              : 'Add goals and allow Nutrition sharing for every selected person.'
          }
          checked={nutritionReady && options.followNutrition}
          disabled={!nutritionReady}
          onChange={(value) => set('followNutrition', value)}
        />
        {recipebook ? (
          <Toggle
            label="Use paid AI for unfilled slots"
            description="Off by default. Only requests new recipes when saved recipes leave gaps."
            checked={options.generateMissingRecipes}
            onChange={(value) => set('generateMissingRecipes', value)}
          />
        ) : null}
        <Toggle
          label="Reuse ingredients"
          description="Prefer overlapping ingredients. This does not create a shopping list."
          checked={options.easyGroceryList}
          onChange={(value) => set('easyGroceryList', value)}
        />
        <Toggle
          label="Allow repeating meals"
          checked={options.allowRepeatingMeals}
          onChange={(value) => set('allowRepeatingMeals', value)}
        />
        <Toggle
          label="Dinner for next-day lunch"
          description="Use dinner for lunch the next day and increase dinner servings."
          checked={options.planLeftovers}
          onChange={(value) => set('planLeftovers', value)}
        />
        {!recipebook ? (
          <>
            <Toggle
              label="Generate recipe images"
              description="This increases API costs significantly."
              checked={imageGenerationEnabled && options.generateRecipeImages}
              disabled={!imageGenerationEnabled}
              onChange={(value) => set('generateRecipeImages', value)}
            />
            {!imageGenerationEnabled ? (
              <p className={styles.imageSettingNote}>
                Image generation is disabled for the household.{' '}
                <Link href="/account/ai">Enable it in AI settings</Link>.
              </p>
            ) : null}
          </>
        ) : null}
      </fieldset>
      <button
        type="button"
        className={recipebook ? styles.recipebookAction : styles.aiAction}
        disabled={busy}
        onClick={onGenerate}
      >
        {busy ? (
          <>
            <LoadingIndicator label="Generating plan" /> Generating…
          </>
        ) : recipebook ? (
          options.generateMissingRecipes ? (
            'Prepare plan with optional paid AI'
          ) : (
            'Prepare saved-recipe plan'
          )
        ) : (
          'Generate with AI'
        )}
      </button>
    </article>
  );
}

export function AiMealPlanGenerator({
  weekStart,
  weekEnd,
  mealSlots,
  profiles,
  label = 'Generate meal plan',
  triggerClassName,
  disabled = false,
  aiModel,
  imageGenerationEnabled,
  mealTypeOptions,
  open: controlledOpen,
  onOpenChange,
  onEditSettings,
  hideTrigger = false,
}: {
  weekStart: string;
  weekEnd: string;
  mealSlots: string[];
  profiles: PlannerProfile[];
  label?: string;
  triggerClassName?: string;
  disabled?: boolean;
  aiModel: string;
  imageGenerationEnabled: boolean;
  mealTypeOptions?: MealTypeOption[];
  open?: boolean;
  onOpenChange?: (open: boolean) => void;
  onEditSettings?: () => void;
  hideTrigger?: boolean;
}) {
  const instanceId = useId();
  const dialogId = `${instanceId}-meal-plan-generator`;
  const headingId = `${instanceId}-meal-plan-generator-title`;
  const reviewHeadingRef = useRef<HTMLHeadingElement>(null);
  const bodyRef = useRef<HTMLDivElement>(null);
  const launchRef = useRef<HTMLButtonElement>(null);
  const [localOpen, setLocalOpen] = useState(false);
  const open = controlledOpen ?? localOpen;
  function setOpen(value: boolean) {
    setLocalOpen(value);
    onOpenChange?.(value);
  }
  const [busy, setBusy] = useState(false);
  const [activeMode, setActiveMode] = useState<'recipebook' | 'ai'>('recipebook');
  const [recipebookOptions, setRecipebookOptions] = useState(DEFAULT_OPTIONS);
  const [aiOptions, setAiOptions] = useState(DEFAULT_OPTIONS);
  const [proposal, setProposal] = useState<MealPlanProposal | null>(null);
  const [conflictResolutions, setConflictResolutions] = useState<
    Record<string, 'keep' | 'replace'>
  >({});
  const [status, setStatus] = useState('');
  const [reviewing, setReviewing] = useState(false);
  const [proposalPeople, setProposalPeople] = useState(profiles);
  const [proposalMealTypes, setProposalMealTypes] = useState(mealTypeOptions);
  const [submittedContext, setSubmittedContext] = useState<{
    weekStart: string;
    weekEnd: string;
    mealSlots: string[];
    profiles: PlannerProfile[];
  } | null>(null);
  const nutritionReady = profiles.length > 0 && profiles.every((profile) => profile.nutritionReady);
  const aiCostEstimate = useMemo(
    () =>
      estimateAiMealPlanCost({
        model: aiModel,
        startDate: weekStart,
        endDate: weekEnd,
        mealSlots,
        profileCount: profiles.length,
        allowRepeatingMeals:
          activeMode === 'recipebook'
            ? recipebookOptions.allowRepeatingMeals
            : aiOptions.allowRepeatingMeals,
        planLeftovers:
          activeMode === 'recipebook' ? recipebookOptions.planLeftovers : aiOptions.planLeftovers,
        generateRecipeImages:
          activeMode === 'ai' && imageGenerationEnabled && aiOptions.generateRecipeImages,
      }),
    [
      aiModel,
      weekStart,
      weekEnd,
      mealSlots,
      profiles.length,
      aiOptions,
      recipebookOptions,
      activeMode,
      imageGenerationEnabled,
    ],
  );

  useEffect(() => {
    if (reviewing && proposal) {
      if (bodyRef.current) bodyRef.current.scrollTop = 0;
      reviewHeadingRef.current?.focus({ preventScroll: true });
    }
  }, [reviewing, proposal]);
  function close() {
    if (busy) return;
    setOpen(false);
  }

  async function generate(mode: 'recipebook' | 'ai') {
    if (busy) return;
    const options = mode === 'recipebook' ? recipebookOptions : aiOptions;
    if (proposal && !window.confirm('Replace the retained proposal with a new request?')) return;
    setActiveMode(mode);
    setSubmittedContext({ weekStart, weekEnd, mealSlots: [...mealSlots], profiles: [...profiles] });
    const requestedPeople = [...profiles];
    const requestedMealTypes = mealTypeOptions?.map((option) => ({ ...option }));
    setBusy(true);
    setStatus('Preparing a complete plan for review…');
    try {
      const response = await fetch('/api/v1/ai/meal-plans/generate', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          mode,
          startDate: weekStart,
          endDate: weekEnd,
          mealSlots,
          servings: profiles.length,
          sourceMode: mode === 'ai' ? 'new' : 'existing',
          occupiedSlotMode: 'review',
          selectedProfileIds: profiles.map((profile) => profile.id),
          options: {
            ...options,
            followNutrition: nutritionReady && options.followNutrition,
            generateRecipeImages:
              mode === 'ai' && imageGenerationEnabled && options.generateRecipeImages,
          },
          fixedMeals: [],
          instructions: '',
        }),
      });
      if (!response.ok) throw new Error(await responseError(response));
      const body = (await response.json()) as { proposal: MealPlanProposal };
      setProposal(body.proposal);
      setProposalPeople(requestedPeople);
      setProposalMealTypes(requestedMealTypes);
      setReviewing(true);
      setConflictResolutions({});
      setStatus('Review the proposed plan. No recipes or calendar entries have been saved.');
    } catch (error) {
      setStatus(error instanceof Error ? error.message : 'The meal plan could not be generated.');
    } finally {
      setBusy(false);
    }
  }

  async function decide(decision: 'confirm' | 'cancel') {
    if (!proposal || busy) return;
    setBusy(true);
    setStatus(decision === 'confirm' ? 'Saving the reviewed plan…' : 'Cancelling the preview…');
    try {
      const response = await fetch(`/api/v1/ai/actions/${proposal.id}`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          decision,
          conflictResolutions: Object.entries(conflictResolutions).map(([entryId, resolution]) => ({
            entryId,
            resolution,
          })),
        }),
      });
      if (!response.ok) throw new Error(await responseError(response));
      const body = (await response.json()) as {
        action: { result?: { imageJobId?: string | null } | null };
      };
      if (decision === 'confirm') {
        setProposal(null);
        setReviewing(false);
        setStatus(
          body.action.result?.imageJobId
            ? 'Meal plan saved. Recipe images are generating in the background.'
            : 'Meal plan saved. Refreshing…',
        );
        window.setTimeout(() => window.location.reload(), 900);
      } else {
        setProposal(null);
        setReviewing(false);
        setStatus('Preview cancelled. Nothing was changed.');
      }
    } catch (error) {
      setStatus(error instanceof Error ? error.message : 'The proposal could not be updated.');
    } finally {
      setBusy(false);
    }
  }

  const generatedNames = useMemo(
    () =>
      new Map(
        proposal?.preview.candidate.newRecipes.map((item) => [item.key, item.recipe.title]) ?? [],
      ),
    [proposal],
  );
  const effective = effectivePlanEntries(
    proposal?.preview.candidate.entries ?? [],
    proposal?.preview.conflicts ?? [],
    conflictResolutions,
  );
  const removedConflicts =
    proposal?.preview.conflicts.filter(
      (conflict) => conflictResolutions[conflict.entryId] === 'replace',
    ) ?? [];
  const insertedKeys = new Set(effective.filter((item) => item.inserted).map((item) => item.key));
  const leftovers = new Set(
    proposal?.preview.candidate.leftoverLinks
      .filter(
        (link) =>
          insertedKeys.has(link.sourceEntryKey) && insertedKeys.has(link.destinationEntryKey),
      )
      .map((link) => link.destinationEntryKey) ?? [],
  );
  const acceptedRecipeKeys = new Set(
    effective
      .filter((item) => item.inserted)
      .flatMap((item) => (item.entry.newRecipeKey ? [item.entry.newRecipeKey] : [])),
  );
  const display =
    reviewing && proposal
      ? {
          weekStart: proposal.preview.request.startDate,
          weekEnd: proposal.preview.request.endDate,
          mealSlots: proposal.preview.request.mealSlots,
          profiles: proposalPeople,
        }
      : busy && submittedContext
        ? submittedContext
        : { weekStart, weekEnd, mealSlots, profiles };
  const requestedSlotCount = proposal
    ? Math.max(
        1,
        Math.round(
          (Date.parse(`${proposal.preview.request.endDate}T12:00:00Z`) -
            Date.parse(`${proposal.preview.request.startDate}T12:00:00Z`)) /
            86_400_000,
        ) + 1,
      ) * proposal.preview.request.mealSlots.length
    : 0;
  const mealLabel = (value: string) =>
    mealTypeLabel(value, reviewing && proposal ? proposalMealTypes : mealTypeOptions);
  const unresolvedConflicts =
    proposal?.preview.conflicts.filter((conflict) => !conflictResolutions[conflict.entryId]) ?? [];

  return (
    <>
      {!hideTrigger ? (
        <button
          ref={launchRef}
          className={`${styles.launch}${triggerClassName ? ` ${triggerClassName}` : ''}`}
          type="button"
          disabled={disabled}
          aria-haspopup="dialog"
          aria-controls={dialogId}
          aria-expanded={open}
          onClick={() => setOpen(true)}
        >
          <Sparkles size={18} aria-hidden="true" /> {label}
        </button>
      ) : null}
      {open ? (
        <AppDialog
          id={dialogId}
          className={styles.dialog}
          aria-labelledby={headingId}
          onClose={close}
          onKeyDown={(event) => {
            if (event.key === 'Escape') {
              event.preventDefault();
              event.stopPropagation();
              if (!busy) close();
            }
          }}
        >
          <div className={styles.dialogShell}>
            <header className={styles.heading}>
              <div>
                <h2 id={headingId} ref={reviewHeadingRef} tabIndex={-1}>
                  {reviewing && proposal ? 'Review your meal plan' : 'Generate your meal plan'}
                </h2>
                <p>
                  {reviewing && proposal
                    ? 'Review recipes and occupied slots, then confirm the effective plan.'
                    : 'Start with your recipebook or create a new plan with AI. You’ll review everything before saving.'}
                </p>
              </div>
              <button
                className={styles.close}
                type="button"
                aria-label="Close meal plan generator"
                disabled={busy}
                onClick={close}
              >
                <X size={20} />
              </button>
            </header>

            <div className={styles.body} ref={bodyRef}>
              <section className={styles.contextStrip} aria-label="Planner selections">
                <div>
                  <CalendarDays aria-hidden="true" />
                  <span>
                    <small>Date range</small>
                    {shortDate(display.weekStart)} – {shortDate(display.weekEnd)}
                  </span>
                </div>
                <div>
                  <Utensils aria-hidden="true" />
                  <span>
                    <small>Meals</small>
                    {display.mealSlots.map(mealLabel).join(', ')}
                  </span>
                </div>
                <div>
                  <UsersRound aria-hidden="true" />
                  <span>
                    <small>Who’s eating</small>
                    {display.profiles.map((profile) => profile.displayName).join(', ')}
                  </span>
                </div>
                <button
                  type="button"
                  disabled={busy}
                  onClick={() => {
                    if (onEditSettings) {
                      setLocalOpen(false);
                      onEditSettings();
                    } else close();
                  }}
                >
                  {onEditSettings ? 'Edit plan settings' : 'Close to edit settings'}
                </button>
              </section>

              {!reviewing || !proposal ? (
                <>
                  {!nutritionReady ? (
                    <p className={styles.nutritionNotice}>
                      Goal-based AI context is unavailable until selected people have goals and
                      permit sharing. <Link href="/settings/profiles">Review profiles</Link>
                    </p>
                  ) : null}
                  <div className={styles.modeChooser} role="group" aria-label="Planning route">
                    {(['recipebook', 'ai'] as const).map((mode) => (
                      <button
                        type="button"
                        key={mode}
                        disabled={busy}
                        aria-pressed={activeMode === mode}
                        onClick={() => setActiveMode(mode)}
                      >
                        <strong>
                          {mode === 'recipebook'
                            ? 'Use saved recipes'
                            : 'Create new recipes with AI'}
                        </strong>
                        <span>
                          {mode === 'recipebook'
                            ? 'Prepare from your recipebook; paid fallback is optional.'
                            : 'Paid generation, followed by review.'}
                        </span>
                      </button>
                    ))}
                  </div>
                  {proposal ? (
                    <button type="button" disabled={busy} onClick={() => setReviewing(true)}>
                      Resume retained proposal · {shortDate(proposal.preview.request.startDate)}–
                      {shortDate(proposal.preview.request.endDate)}
                    </button>
                  ) : null}
                  <div className={styles.modeGrid} aria-busy={busy}>
                    <ModeOptions
                      mode={activeMode}
                      options={activeMode === 'recipebook' ? recipebookOptions : aiOptions}
                      nutritionReady={nutritionReady}
                      busy={busy}
                      imageGenerationEnabled={imageGenerationEnabled}
                      costEstimate={aiCostEstimate}
                      onOptions={activeMode === 'recipebook' ? setRecipebookOptions : setAiOptions}
                      onGenerate={() => void generate(activeMode)}
                    />
                  </div>
                </>
              ) : (
                <div className={styles.review}>
                  {proposal.preview.conflicts.length ? (
                    <section className={styles.conflicts} aria-labelledby="plan-conflicts-title">
                      <div>
                        <h3 id="plan-conflicts-title">Choose what happens to occupied slots</h3>
                        <p>Every existing meal stays untouched unless you explicitly replace it.</p>
                      </div>
                      <p>
                        {unresolvedConflicts.length} unresolved{' '}
                        {unresolvedConflicts.length === 1 ? 'choice' : 'choices'}.{' '}
                        <button
                          type="button"
                          onClick={() =>
                            document
                              .getElementById(`conflict-${unresolvedConflicts[0]?.entryId}`)
                              ?.focus()
                          }
                        >
                          Go to first unresolved choice
                        </button>
                      </p>
                      {proposal.preview.conflicts.map((conflict) => (
                        <div
                          className={styles.conflictRow}
                          key={conflict.entryId}
                          id={`conflict-${conflict.entryId}`}
                          tabIndex={-1}
                        >
                          <span>
                            <strong>{conflict.title}</strong>
                            <small>
                              {shortDate(conflict.plannedFor)} · {mealLabel(conflict.meal)}
                            </small>
                          </span>
                          <div>
                            {(['keep', 'replace'] as const).map((resolution) => (
                              <button
                                key={resolution}
                                type="button"
                                disabled={busy}
                                aria-pressed={conflictResolutions[conflict.entryId] === resolution}
                                onClick={() =>
                                  setConflictResolutions((current) => ({
                                    ...current,
                                    [conflict.entryId]: resolution,
                                  }))
                                }
                              >
                                {resolution === 'keep' ? 'Keep existing' : 'Replace existing'}
                              </button>
                            ))}
                          </div>
                        </div>
                      ))}
                    </section>
                  ) : null}

                  <p>
                    {proposal.preview.candidate.entries.length} of {requestedSlotCount} requested
                    meal slots included.{' '}
                    {requestedSlotCount > proposal.preview.candidate.entries.length
                      ? `${requestedSlotCount - proposal.preview.candidate.entries.length} remain unfilled; add these separately or revise the options.`
                      : 'All requested slots are included for review.'}
                  </p>
                  {effective
                    .filter((item) => !item.inserted && item.removed.length)
                    .map((item) => (
                      <p key={item.key}>
                        {shortDate(item.entry.plannedFor)} · {mealLabel(item.entry.meal)}: keeping a
                        meal retains this slot.{' '}
                        {item.removed.map((conflict) => conflict.title).join(', ')} will leave the
                        active plan; the proposed meal will not be added.
                      </p>
                    ))}
                  <section className={styles.planPreview} aria-label="Proposed meals">
                    {proposal.preview.candidate.entries.map((entry) => {
                      const key = entry.entryKey ?? `${entry.plannedFor}:${entry.meal}`;
                      const effectiveEntry = effective.find((item) => item.key === key);
                      const kept = Boolean(effectiveEntry?.kept.length);
                      return (
                        <article className={kept ? styles.previewMealKept : undefined} key={key}>
                          <div>
                            <span>{shortDate(entry.plannedFor)}</span>
                            <small>{mealLabel(entry.meal)}</small>
                          </div>
                          <div>
                            <strong>
                              {kept
                                ? proposal.preview.conflicts
                                    .filter(
                                      (item) =>
                                        item.plannedFor === entry.plannedFor &&
                                        item.meal === entry.meal &&
                                        conflictResolutions[item.entryId] === 'keep',
                                    )
                                    .map((item) => item.title)
                                    .join(' · ')
                                : (generatedNames.get(entry.newRecipeKey ?? '') ?? entry.title)}
                            </strong>
                            <span>
                              {kept
                                ? 'Retained meal; existing portions stay unchanged'
                                : leftovers.has(key)
                                  ? 'Next-day leftovers'
                                  : entry.newRecipeKey
                                    ? 'New AI recipe'
                                    : 'Saved recipe'}
                            </span>
                          </div>
                          <span>
                            {kept ? 'Keeping existing' : `${entry.servings} servings`}
                            {!kept && entry.existingRecipeId ? (
                              <Link href={`/recipes/${entry.existingRecipeId}`} target="_blank">
                                Review saved recipe
                              </Link>
                            ) : null}
                          </span>
                        </article>
                      );
                    })}
                  </section>

                  {proposal.preview.candidate.leftoverLinks.length > leftovers.size ? (
                    <p>
                      Only links with both meals accepted will be created. Other accepted meals
                      remain independent; retained meals and portions stay unchanged.
                    </p>
                  ) : null}
                  <section className={styles.profileSummary} aria-label="Nutrition portions">
                    {proposalPeople.map((profile) => {
                      const servings = proposal.preview.candidate.allocations
                        .filter(
                          (allocation) =>
                            allocation.householdProfileId === profile.id &&
                            insertedKeys.has(allocation.entryKey),
                        )
                        .reduce((total, allocation) => total + allocation.servings, 0);
                      return (
                        <div key={profile.id}>
                          <Check aria-hidden="true" />
                          <span>
                            <strong>{profile.displayName}</strong>
                            <small>
                              {servings} new planned {servings === 1 ? 'serving' : 'servings'}
                              {proposal.preview.request.mode
                                ? ` · ${proposal.preview.request.mode === 'ai' ? 'AI plan' : 'recipebook plan'}`
                                : ''}
                            </small>
                          </span>
                        </div>
                      );
                    })}
                  </section>

                  <section className={styles.recipeReview} aria-label="Recipe details to review">
                    {proposal.preview.candidate.newRecipes
                      .filter((item) => acceptedRecipeKeys.has(item.key))
                      .map(({ key, recipe }) => (
                        <details key={key}>
                          <summary>{recipe.title} · ingredients and method</summary>
                          <p>{recipe.summary}</p>
                          <p>
                            {recipeTiming(recipe)} · Yield {recipe.servings}
                          </p>
                          {recipe.ingredientGroups.map((group, index) => (
                            <section key={index}>
                              <h4>{group.name || 'Ingredients'}</h4>
                              <ul>
                                {group.ingredients.map((item, i) => (
                                  <li key={i}>
                                    {item.quantity} {item.unit} {item.item}
                                    {item.note ? ` · ${item.note}` : ''}
                                  </li>
                                ))}
                              </ul>
                            </section>
                          ))}
                          {recipe.instructionSections.map((section, index) => (
                            <section key={index}>
                              <h4>{section.title || 'Method'}</h4>
                              <ol>
                                {section.steps.map((step, i) => (
                                  <li key={i}>{step}</li>
                                ))}
                              </ol>
                            </section>
                          ))}
                        </details>
                      ))}
                  </section>
                  <p>
                    {unresolvedConflicts.length ? 'Proposed, pending choices: ' : ''}
                    {insertedKeys.size} new/replaced calendar entries · {acceptedRecipeKeys.size}{' '}
                    new recipes · {leftovers.size} new leftover links · {removedConflicts.length}{' '}
                    existing meals replaced.{' '}
                    {proposal.preview.request.options?.generateRecipeImages
                      ? `${acceptedRecipeKeys.size} images requested after saving.`
                      : ''}{' '}
                    {insertedKeys.size === 0 && removedConflicts.length === 0
                      ? 'Keeping everything creates no calendar entries, recipes or new portions.'
                      : insertedKeys.size === 0
                        ? 'Confirmation removes the explicitly replaced meals from the active plan. Historical entries may remain cancelled. Retained meals and portions stay unchanged; no proposed meals are added.'
                        : 'Confirmation saves accepted recipes, schedules meals and records planned portions. It also prepares the plan’s grocery list.'}
                  </p>
                  {proposal.preview.candidate.assumptions.length ? (
                    <details>
                      <summary>Plan assumptions</summary>
                      <ul>
                        {proposal.preview.candidate.assumptions.map((item) => (
                          <li key={item}>{item}</li>
                        ))}
                      </ul>
                    </details>
                  ) : null}
                  {proposal.preview.candidate.warnings.length ? (
                    <section className={styles.warnings} aria-label="Plan warnings">
                      <strong>Before you save</strong>
                      <ul>
                        {proposal.preview.candidate.warnings.map((warning) => (
                          <li key={warning}>{warning}</li>
                        ))}
                      </ul>
                    </section>
                  ) : null}

                  <p>
                    Closing keeps this preview on this page. Changing view/period, leaving the
                    planner or reloading closes it.
                  </p>
                  <div className={styles.reviewActions}>
                    <button
                      type="button"
                      disabled={busy}
                      onClick={() => {
                        setReviewing(false);
                        setStatus(
                          'Proposal retained. Resume it or deliberately replace it with a new request.',
                        );
                      }}
                    >
                      <ArrowLeft aria-hidden="true" /> Back to options
                    </button>
                    <button type="button" disabled={busy} onClick={() => void decide('cancel')}>
                      Cancel preview
                    </button>
                    <button
                      type="button"
                      className={styles.confirmAction}
                      disabled={
                        busy ||
                        unresolvedConflicts.length > 0 ||
                        (insertedKeys.size === 0 && removedConflicts.length === 0)
                      }
                      onClick={() => void decide('confirm')}
                    >
                      {busy ? (
                        <>
                          <LoadingIndicator label="Saving plan" /> Saving…
                        </>
                      ) : (
                        'Confirm and save'
                      )}
                    </button>
                  </div>
                </div>
              )}

              {busy && !proposal ? (
                <AsyncSkeleton
                  className={styles.loading}
                  label="Preparing your meal plan"
                  variant="panel"
                />
              ) : null}
            </div>
            <footer className={styles.safetyFooter}>
              <LockKeyhole aria-hidden="true" />
              <span>
                Generating saves a review proposal. Recipes, calendar entries and planned portions
                are applied only after confirmation.
              </span>
            </footer>
            <p
              className={styles.status}
              role={status.toLocaleLowerCase().includes('could not') ? 'alert' : 'status'}
            >
              {status}
            </p>
          </div>
        </AppDialog>
      ) : null}
    </>
  );
}
