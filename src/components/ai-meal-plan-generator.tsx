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
import { useEffect, useId, useMemo, useRef, useState } from 'react';

import { AsyncSkeleton, InlineSkeleton } from '@/components/skeleton';
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
    request: { mode: 'recipebook' | 'ai' };
    selectedProfileIds: string[];
    candidate: {
      newRecipes: Array<{ key: string; recipe: { title: string } }>;
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
  if (value < 0.01) return `<$0.01`;
  return `~$${value.toFixed(2)}`;
}

async function responseError(response: Response) {
  const body = (await response.json().catch(() => null)) as { error?: { message?: string } } | null;
  return body?.error?.message ?? 'The meal plan could not be generated.';
}

function shortDate(value: string): string {
  return new Intl.DateTimeFormat('en-US', { month: 'short', day: 'numeric' }).format(
    new Date(`${value}T12:00:00Z`),
  );
}

function mealLabel(value: string): string {
  return value.charAt(0).toLocaleUpperCase() + value.slice(1);
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
          <h3>{recipebook ? 'Plan from recipebook' : 'Create a plan with AI'}</h3>
          <p>
            {recipebook
              ? 'Automatically fill selected meal slots with trusted saved recipes.'
              : 'Create a complete set of new recipes around the selected household and week.'}
          </p>
          {!recipebook && costEstimate ? (
            <div className={styles.costEstimate} aria-label="Estimated AI API cost">
              <div>
                <span>Estimated API cost</span>
                <strong>{estimatedUsd(costEstimate.totalUsd)}</strong>
              </div>
              <dl>
                <div>
                  <dt>Input</dt>
                  <dd>{estimatedUsd(costEstimate.inputUsd)}</dd>
                </div>
                <div>
                  <dt>Output</dt>
                  <dd>{estimatedUsd(costEstimate.outputUsd)}</dd>
                </div>
                {costEstimate.imageCount ? (
                  <div>
                    <dt>{costEstimate.imageCount} images</dt>
                    <dd>{estimatedUsd(costEstimate.imageUsd)}</dd>
                  </div>
                ) : null}
              </dl>
              <small>
                Estimate only · actual token use may vary · pricing checked {AI_PRICING_AS_OF}
              </small>
            </div>
          ) : null}
        </div>
      </div>
      <div className={styles.toggleList}>
        <Toggle
          label={recipebook ? 'Follow nutritional guides' : 'Follow nutrition plan'}
          description={
            nutritionReady
              ? 'Uses goals for everyone selected in Who’s eating.'
              : 'Add goals and allow Nutrition sharing for every selected person.'
          }
          checked={nutritionReady && options.followNutrition}
          disabled={!nutritionReady}
          onChange={(value) => set('followNutrition', value)}
        />
        {recipebook ? (
          <Toggle
            label="AI-generate missing recipes"
            checked={options.generateMissingRecipes}
            onChange={(value) => set('generateMissingRecipes', value)}
          />
        ) : null}
        <Toggle
          label="Easy Grocery List"
          checked={options.easyGroceryList}
          onChange={(value) => set('easyGroceryList', value)}
        />
        <Toggle
          label="Allow repeating meals"
          checked={options.allowRepeatingMeals}
          onChange={(value) => set('allowRepeatingMeals', value)}
        />
        <Toggle
          label="Leftovers"
          description="Use dinner for lunch the next day and increase dinner servings."
          checked={options.planLeftovers}
          onChange={(value) => set('planLeftovers', value)}
        />
        {!recipebook ? (
          <>
            <Toggle
              label="Generate recipe images?"
              description="This increases API costs significantly."
              checked={imageGenerationEnabled && options.generateRecipeImages}
              disabled={!imageGenerationEnabled}
              onChange={(value) => set('generateRecipeImages', value)}
            />
            {!imageGenerationEnabled ? (
              <p className={styles.imageSettingNote}>
                Image generation is disabled for the household.{' '}
                <Link href="/settings/ai">Enable it in AI settings</Link>.
              </p>
            ) : null}
          </>
        ) : null}
      </div>
      <button
        type="button"
        className={recipebook ? styles.recipebookAction : styles.aiAction}
        disabled={busy}
        onClick={onGenerate}
      >
        {busy ? (
          <InlineSkeleton label="Generating plan" width="7rem" />
        ) : recipebook ? (
          'Generate from recipebook'
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
}) {
  const instanceId = useId();
  const dialogId = `${instanceId}-meal-plan-generator`;
  const headingId = `${instanceId}-meal-plan-generator-title`;
  const dialogRef = useRef<HTMLDialogElement>(null);
  const launchRef = useRef<HTMLButtonElement>(null);
  const [open, setOpen] = useState(false);
  const [busy, setBusy] = useState(false);
  const [activeMode, setActiveMode] = useState<'recipebook' | 'ai' | null>(null);
  const [recipebookOptions, setRecipebookOptions] = useState(DEFAULT_OPTIONS);
  const [aiOptions, setAiOptions] = useState(DEFAULT_OPTIONS);
  const [proposal, setProposal] = useState<MealPlanProposal | null>(null);
  const [conflictResolutions, setConflictResolutions] = useState<
    Record<string, 'keep' | 'replace'>
  >({});
  const [status, setStatus] = useState('');
  const nutritionReady = profiles.length > 0 && profiles.every((profile) => profile.nutritionReady);
  const aiCostEstimate = useMemo(
    () =>
      estimateAiMealPlanCost({
        model: aiModel,
        startDate: weekStart,
        endDate: weekEnd,
        mealSlots,
        profileCount: profiles.length,
        allowRepeatingMeals: aiOptions.allowRepeatingMeals,
        planLeftovers: aiOptions.planLeftovers,
        generateRecipeImages: imageGenerationEnabled && aiOptions.generateRecipeImages,
      }),
    [aiModel, weekStart, weekEnd, mealSlots, profiles.length, aiOptions, imageGenerationEnabled],
  );

  useEffect(() => {
    const dialog = dialogRef.current;
    if (!dialog) return;
    if (open && !dialog.open) dialog.showModal();
    if (!open && dialog.open) dialog.close();
  }, [open]);

  function close() {
    setOpen(false);
    window.setTimeout(() => launchRef.current?.focus(), 0);
  }

  async function generate(mode: 'recipebook' | 'ai') {
    const options = mode === 'recipebook' ? recipebookOptions : aiOptions;
    setActiveMode(mode);
    setBusy(true);
    setStatus('Preparing a complete plan for review…');
    setProposal(null);
    setConflictResolutions({});
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
          sourceMode: mode === 'ai' ? 'new' : options.generateMissingRecipes ? 'mix' : 'existing',
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
      setStatus('Review the proposed week. Nothing has been saved.');
    } catch (error) {
      setStatus(error instanceof Error ? error.message : 'The meal plan could not be generated.');
    } finally {
      setBusy(false);
    }
  }

  async function decide(decision: 'confirm' | 'cancel') {
    if (!proposal) return;
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
      if (decision === 'confirm') {
        setStatus('Meal plan saved. Refreshing…');
        window.location.reload();
      } else {
        setProposal(null);
        setActiveMode(null);
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
  const leftovers = new Set(
    proposal?.preview.candidate.leftoverLinks.map((link) => link.destinationEntryKey) ?? [],
  );
  const unresolvedConflicts =
    proposal?.preview.conflicts.filter((conflict) => !conflictResolutions[conflict.entryId]) ?? [];

  return (
    <>
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
      <dialog
        id={dialogId}
        ref={dialogRef}
        className={styles.dialog}
        aria-labelledby={headingId}
        onCancel={(event) => {
          event.preventDefault();
          if (!busy) close();
        }}
        onKeyDown={(event) => {
          if (event.key === 'Escape' && !busy) {
            event.preventDefault();
            close();
          }
        }}
        onClose={() => setOpen(false)}
      >
        <div className={styles.dialogShell}>
          <header className={styles.heading}>
            <div>
              <h2 id={headingId}>
                {proposal ? 'Review your meal plan' : 'Generate your meal plan'}
              </h2>
              <p>
                {proposal
                  ? 'Resolve occupied slots, check the week, then confirm when it feels right.'
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

          <section className={styles.contextStrip} aria-label="Planner selections">
            <div>
              <CalendarDays aria-hidden="true" />
              <span>
                <small>Week</small>
                {shortDate(weekStart)} – {shortDate(weekEnd)}
              </span>
            </div>
            <div>
              <Utensils aria-hidden="true" />
              <span>
                <small>Meals</small>
                {mealSlots.map(mealLabel).join(', ')}
              </span>
            </div>
            <div className={styles.eaters}>
              <UsersRound aria-hidden="true" />
              <span>
                <small>Who’s eating</small>
                {profiles.map((profile) => profile.displayName).join(', ')}
              </span>
            </div>
            <button type="button" onClick={close}>
              Edit in planner
            </button>
          </section>

          {!proposal ? (
            <>
              {!nutritionReady ? (
                <p className={styles.nutritionNotice}>
                  Nutrition matching is unavailable until every selected person has goals and has
                  enabled Nutrition sharing. <Link href="/settings/profiles">Review profiles</Link>
                </p>
              ) : null}
              <div className={styles.modeGrid} aria-busy={busy}>
                <ModeOptions
                  mode="recipebook"
                  options={recipebookOptions}
                  nutritionReady={nutritionReady}
                  busy={busy}
                  imageGenerationEnabled={imageGenerationEnabled}
                  onOptions={setRecipebookOptions}
                  onGenerate={() => void generate('recipebook')}
                />
                <ModeOptions
                  mode="ai"
                  options={aiOptions}
                  nutritionReady={nutritionReady}
                  busy={busy}
                  imageGenerationEnabled={imageGenerationEnabled}
                  costEstimate={aiCostEstimate}
                  onOptions={setAiOptions}
                  onGenerate={() => void generate('ai')}
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
                  {proposal.preview.conflicts.map((conflict) => (
                    <div className={styles.conflictRow} key={conflict.entryId}>
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
                            aria-pressed={conflictResolutions[conflict.entryId] === resolution}
                            onClick={() =>
                              setConflictResolutions((current) => ({
                                ...current,
                                [conflict.entryId]: resolution,
                              }))
                            }
                          >
                            {resolution === 'keep' ? 'Keep existing' : 'Use new meal'}
                          </button>
                        ))}
                      </div>
                    </div>
                  ))}
                </section>
              ) : null}

              <section className={styles.planPreview} aria-label="Proposed meals">
                {proposal.preview.candidate.entries.map((entry) => {
                  const key = entry.entryKey ?? `${entry.plannedFor}:${entry.meal}`;
                  const conflict = proposal.preview.conflicts.find(
                    (item) => item.plannedFor === entry.plannedFor && item.meal === entry.meal,
                  );
                  const kept = conflict && conflictResolutions[conflict.entryId] === 'keep';
                  return (
                    <article className={kept ? styles.previewMealKept : undefined} key={key}>
                      <div>
                        <span>{shortDate(entry.plannedFor)}</span>
                        <small>{mealLabel(entry.meal)}</small>
                      </div>
                      <div>
                        <strong>
                          {generatedNames.get(entry.newRecipeKey ?? '') ?? entry.title}
                        </strong>
                        <span>
                          {leftovers.has(key)
                            ? 'Next-day leftovers'
                            : entry.newRecipeKey
                              ? 'New AI recipe'
                              : 'Saved recipe'}
                        </span>
                      </div>
                      <span>{kept ? 'Keeping existing' : `${entry.servings} servings`}</span>
                    </article>
                  );
                })}
              </section>

              <section className={styles.profileSummary} aria-label="Nutrition portions">
                {profiles.map((profile) => {
                  const servings = proposal.preview.candidate.allocations
                    .filter((allocation) => allocation.householdProfileId === profile.id)
                    .reduce((total, allocation) => total + allocation.servings, 0);
                  return (
                    <div key={profile.id}>
                      <Check aria-hidden="true" />
                      <span>
                        <strong>{profile.displayName}</strong>
                        <small>
                          {servings} planned servings
                          {activeMode
                            ? ` · ${activeMode === 'ai' ? 'AI plan' : 'recipebook plan'}`
                            : ''}
                        </small>
                      </span>
                    </div>
                  );
                })}
              </section>

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

              <div className={styles.reviewActions}>
                <button
                  type="button"
                  disabled={busy}
                  onClick={() => {
                    setProposal(null);
                    setConflictResolutions({});
                    setStatus('');
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
                  disabled={busy || unresolvedConflicts.length > 0}
                  onClick={() => void decide('confirm')}
                >
                  {busy ? <InlineSkeleton label="Saving plan" width="5rem" /> : 'Confirm and save'}
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
          <footer className={styles.safetyFooter}>
            <LockKeyhole aria-hidden="true" />
            <span>Nothing is saved until you review and confirm the full plan.</span>
          </footer>
          <p
            className={styles.status}
            role={status.toLocaleLowerCase().includes('could not') ? 'alert' : 'status'}
          >
            {status}
          </p>
        </div>
      </dialog>
    </>
  );
}
