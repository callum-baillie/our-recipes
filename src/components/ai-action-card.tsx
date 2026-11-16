'use client';

import {
  ArrowUpRight,
  CalendarDays,
  Camera,
  Check,
  ChefHat,
  ChevronDown,
  Clock3,
  ImageOff,
  Layers3,
  MessageSquarePlus,
  RefreshCw,
  ShoppingBasket,
  Sparkles,
  Users,
  X,
} from 'lucide-react';
import Image from 'next/image';
import Link from 'next/link';
import { useEffect, useRef, useState } from 'react';
import { SwipeRow } from './chat-ui/swipe-row';
import { ButtonSpinner } from './skeleton';

import { ActionButton, Callout, CardFooter, CardHead, Disclosure } from './chat-ui/card-parts';
import cards from './chat-ui/cards.module.css';

import styles from './ai-action-card.module.css';

export type AiImageDelivery = {
  available: boolean;
  reason: string | null;
  count: number;
  mode: 'direct' | 'batch';
};

export type AiDrawerAction = {
  id: string;
  kind: string;
  preview: unknown;
  status: string;
  result?: unknown;
  sourceDigest?: string | null;
  /** What image generation can do for this draft; absent on older saved drafts. */
  imageDelivery?: AiImageDelivery | null;
};

type Resolution = Array<{ entryId: string; resolution: 'keep' | 'replace' }>;
export type DecideHandler = (
  actionId: string,
  decision: 'confirm' | 'cancel',
  resolutions?: Resolution,
  options?: { generateImages?: boolean },
) => void;

function object(value: unknown): Record<string, unknown> | null {
  return value !== null && typeof value === 'object' && !Array.isArray(value)
    ? (value as Record<string, unknown>)
    : null;
}

function list(value: unknown): unknown[] {
  return Array.isArray(value) ? value : [];
}

function text(value: unknown): string {
  return typeof value === 'string' ? value : typeof value === 'number' ? String(value) : '';
}

function number(value: unknown): number {
  return typeof value === 'number' && Number.isFinite(value) ? value : Number(value) || 0;
}

function formatIngredient(value: unknown): string {
  const ingredient = object(value);
  if (!ingredient) return '';
  return [text(ingredient.quantity), text(ingredient.unit), text(ingredient.item)]
    .filter(Boolean)
    .join(' ')
    .concat(text(ingredient.note) ? `, ${text(ingredient.note)}` : '');
}

function countIngredients(recipe: Record<string, unknown>) {
  return list(recipe.ingredientGroups).reduce<number>(
    (count, group) => count + list(object(group)?.ingredients).length,
    0,
  );
}

function plural(count: number, one: string, many = `${one}s`) {
  return `${count} ${count === 1 ? one : many}`;
}

function RecipeFacts({ recipe }: { recipe: Record<string, unknown> }) {
  const totalMinutes =
    number(recipe.prepMinutes) + number(recipe.cookMinutes) + number(recipe.restMinutes);
  const servings = text(recipe.servings);
  const difficulty = text(recipe.difficulty);
  if (!totalMinutes && !servings && !difficulty) return null;
  return (
    <ul className={styles.facts} aria-label="Recipe facts">
      {totalMinutes ? (
        <li>
          <Clock3 aria-hidden="true" /> {totalMinutes} min
        </li>
      ) : null}
      {servings ? (
        <li>
          <Users aria-hidden="true" /> {servings}
        </li>
      ) : null}
      {difficulty ? <li>{difficulty}</li> : null}
    </ul>
  );
}

function Ingredients({ recipe }: { recipe: Record<string, unknown> }) {
  return (
    <>
      {list(recipe.ingredientGroups).map((groupValue, groupIndex) => {
        const group = object(groupValue);
        return (
          <div className={styles.ingredientGroup} key={`${text(group?.name)}-${groupIndex}`}>
            {text(group?.name) ? <h4>{text(group?.name)}</h4> : null}
            <ul>
              {list(group?.ingredients).map((ingredient, index) => (
                <li key={`${formatIngredient(ingredient)}-${index}`}>
                  {formatIngredient(ingredient)}
                </li>
              ))}
            </ul>
          </div>
        );
      })}
    </>
  );
}

function Method({ recipe }: { recipe: Record<string, unknown> }) {
  const sections = list(recipe.instructionSections).map(object).filter(Boolean);
  if (!sections.length) return null;
  return (
    <>
      {sections.map((section, index) => (
        <div className={styles.method} key={index}>
          {text(section?.name) ? <h4>{text(section?.name)}</h4> : null}
          <ol>
            {list(section?.steps).map((step, stepIndex) => (
              <li key={stepIndex}>{text(object(step)?.text) || text(step)}</li>
            ))}
          </ol>
        </div>
      ))}
    </>
  );
}

/** Share of calories from protein, carbohydrate and fat, when the draft states all three. */
function macroSplit(recipe: Record<string, unknown>) {
  const protein = number(recipe.nutritionProteinGrams) * 4;
  const carbs = number(recipe.nutritionCarbohydrateGrams) * 4;
  const fat = number(recipe.nutritionFatGrams) * 9;
  const total = protein + carbs + fat;
  if (!total) return null;
  return [
    { key: 'protein', label: 'Protein', percent: Math.round((protein / total) * 100) },
    { key: 'carbs', label: 'Carbs', percent: Math.round((carbs / total) * 100) },
    { key: 'fat', label: 'Fat', percent: Math.round((fat / total) * 100) },
  ];
}

function PaidPhotoSwitch({
  delivery,
  checked,
  onChange,
  disabled,
  recipes,
}: {
  delivery: AiImageDelivery | null | undefined;
  checked: boolean;
  onChange: (checked: boolean) => void;
  disabled: boolean;
  recipes: number;
}) {
  if (!delivery || !recipes) return null;
  if (!delivery.available)
    return (
      <p className={styles.photoOff}>
        <ImageOff aria-hidden="true" /> No photos for {plural(recipes, 'new recipe')}:{' '}
        {delivery.reason ?? 'image generation is unavailable.'}
      </p>
    );
  return (
    <div className={styles.photoOption}>
      <label>
        <input
          type="checkbox"
          role="switch"
          checked={checked}
          disabled={disabled}
          onChange={(event) => onChange(event.target.checked)}
        />
        <span className={styles.switchTrack} aria-hidden="true" />
        <span className={styles.photoCopy}>
          <strong>
            <Camera aria-hidden="true" /> Create photos for {plural(recipes, 'new recipe')}
          </strong>
          <small>Paid image requests, started only when you confirm.</small>
        </span>
      </label>
      {checked && delivery.mode === 'batch' ? (
        <Callout tone="info">
          <p>
            <strong>This runs as a batch.</strong> Photos can take a while — check back later. Your
            plan is saved straight away and the photos appear on the recipes as they finish.
          </p>
        </Callout>
      ) : null}
    </div>
  );
}

function ImageOutcome({ result }: { result: Record<string, unknown> | null }) {
  const state = text(result?.imageGeneration);
  if (!state || state === 'requires_separate_review' || state === 'none') return null;
  const count = number(result?.imageCount);
  const note = text(result?.imageNote);
  if (state === 'queued')
    return (
      <Callout tone="info">
        <p>
          <strong>
            {count ? `Photos for ${plural(count, 'recipe')}` : 'Recipe photos'} are being created.
          </strong>{' '}
          {text(result?.imageExecutionMode) === 'batch'
            ? 'This is a batch process and may take a while — check back later. Progress shows in the task below and under Background tasks.'
            : 'Progress shows in the task below.'}
        </p>
      </Callout>
    );
  return (
    <Callout tone="warning">
      <p>
        <strong>Saved without photos.</strong> {note || 'Image generation could not be started.'}
      </p>
    </Callout>
  );
}

function RecipeProposalCard({
  action,
  busy,
  pendingDecision,
  onDecide,
  onRefine,
  autoImage = false,
}: {
  action: AiDrawerAction;
  busy: boolean;
  pendingDecision: 'confirm' | 'cancel' | null;
  onDecide: DecideHandler;
  onRefine?: (actionId: string) => void;
  autoImage?: boolean;
}) {
  const preview = object(action.preview) ?? {};
  const recipe = object(action.kind === 'recipe_update' ? preview.after : preview.recipe);
  const [localAction, setLocalAction] = useState<AiDrawerAction | null>(null);
  const [imagePending, setImagePending] = useState(false);
  const [imageError, setImageError] = useState('');
  const [imageOperation, setImageOperation] = useState<string | null>(null);
  const image = object(object(localAction?.preview)?.image ?? preview.image);
  const autoStarted = useRef(false);
  const [autoRequested, setAutoRequested] = useState(false);
  const delivery = action.imageDelivery ?? null;
  async function requestImage(fresh = false) {
    if (!action.sourceDigest || imagePending) return;
    const operationId = fresh
      ? crypto.randomUUID()
      : (imageOperation ?? text(image?.operationId)) || crypto.randomUUID();
    setImageOperation(operationId);
    setImagePending(true);
    setImageError('');
    try {
      const response = await fetch(`/api/v1/ai/actions/${action.id}/image`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          confirm: true,
          operationId,
          expectedSourceDigest: action.sourceDigest,
        }),
      });
      const body = await response.json();
      if (!response.ok)
        throw new Error(
          body.error?.message ??
            'The image request did not finish. Check this request before trying a new one.',
        );
      setLocalAction(body.action);
    } catch (error) {
      setImageError(error instanceof Error ? error.message : 'Unable to check this image request.');
    } finally {
      setImagePending(false);
    }
  }
  const [imageFailed, setImageFailed] = useState(false);
  const wantsAutoImage =
    autoImage &&
    action.kind === 'recipe_create' &&
    action.status === 'pending' &&
    Boolean(action.sourceDigest) &&
    delivery?.available === true &&
    !text(image?.operationId);
  useEffect(() => {
    if (!wantsAutoImage) return;
    // The guard lives in the timer so a development double-mount cannot cancel the one request.
    const start = window.setTimeout(() => {
      if (autoStarted.current) return;
      // One automatic request per draft; a failed or interrupted one is never repeated unasked.
      autoStarted.current = true;
      setAutoRequested(true);
      void requestImage();
    }, 0);
    return () => window.clearTimeout(start);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [wantsAutoImage]);
  if (!recipe) return null;

  const nutrition = [
    ['Calories', text(recipe.nutritionCalories), 'kcal'],
    ['Protein', text(recipe.nutritionProteinGrams), 'g'],
    ['Carbs', text(recipe.nutritionCarbohydrateGrams), 'g'],
    ['Fat', text(recipe.nutritionFatGrams), 'g'],
    ['Fiber', text(recipe.nutritionFiberGrams), 'g'],
    ['Sodium', text(recipe.nutritionSodiumMilligrams), 'mg'],
  ].filter(([, value]) => value !== '');
  const split = macroSplit(recipe);
  const imageStatus = text(image?.status);
  const imageReady = imageStatus === 'ready' && !imageFailed;
  const imageAwaiting = !imagePending && imageStatus === 'requested';
  const imageEnded =
    !imagePending &&
    (['failed', 'cancelled'].includes(imageStatus) || (imageFailed && !imageReady));
  const result = object(action.result);
  const recipeId = text(result?.recipeId);
  const savedImageId = text(result?.imageId);
  const candidateId = text(result?.candidateId);
  const imageSource =
    action.status === 'confirmed' && recipeId && candidateId
      ? `/api/v1/recipes/${recipeId}/image-candidates/${candidateId}/file`
      : action.status === 'confirmed' && recipeId && savedImageId
        ? `/api/v1/recipes/${recipeId}/images/${savedImageId}`
        : `/api/v1/ai/actions/${action.id}/image`;
  const ingredientCount = countIngredients(recipe);
  const isCreate = action.kind === 'recipe_create';
  const title = text(recipe.title) || 'Untitled recipe';
  const pending = action.status === 'pending';
  const showHero = imageReady || imagePending || imageAwaiting || imageEnded;
  // Without a photo yet: either the draft will make one itself, or the person can ask.
  const offerManual =
    isCreate &&
    pending &&
    Boolean(action.sourceDigest) &&
    !autoRequested &&
    !imageReady &&
    !imageEnded &&
    !imageAwaiting;
  const photoBlocked = delivery && !delivery.available && !imageReady;

  return (
    <article
      className={cards.card}
      aria-label={`Recipe proposal: ${title}`}
      aria-busy={pendingDecision !== null || imagePending}
    >
      <CardHead
        icon={ChefHat}
        eyebrow={isCreate ? 'Recipe draft' : 'Recipe changes'}
        title={title}
        subtitle={text(recipe.summary) || undefined}
        status={action.status}
      />

      {showHero ? (
        <div
          className={styles.hero}
          data-state={imageReady ? 'ready' : imagePending ? 'busy' : 'idle'}
        >
          {imageReady ? (
            <>
              <Image
                src={imageSource}
                alt={text(image?.altText) || `AI-generated preview of ${title}`}
                fill
                sizes="(max-width: 540px) 100vw, 420px"
                unoptimized
                onError={() => setImageFailed(true)}
              />
              <span className={styles.heroTag}>
                <Sparkles aria-hidden="true" /> AI photo
              </span>
            </>
          ) : imagePending ? (
            <div className={styles.photoBusy} role="status" aria-label="Creating a photo">
              <span className={styles.photoOrb} aria-hidden="true">
                <Camera />
              </span>
              <strong>Creating a photo…</strong>
              <small>Usually under a minute. You can review the recipe meanwhile.</small>
            </div>
          ) : (
            <div className={styles.photoIdle}>
              <ImageOff aria-hidden="true" />
              <strong>
                {imageAwaiting ? 'Waiting for the photo result' : 'The photo could not be created'}
              </strong>
              <small>
                {imageAwaiting
                  ? 'The request was sent but its outcome was not recorded. Check it before trying again.'
                  : 'A new request is a new paid image request.'}
              </small>
              {pending && action.sourceDigest ? (
                <ActionButton
                  icon={RefreshCw}
                  disabled={busy}
                  onClick={() => void requestImage(!imageAwaiting)}
                >
                  {imageAwaiting ? 'Check this image request' : 'Try again (paid)'}
                </ActionButton>
              ) : null}
            </div>
          )}
        </div>
      ) : null}

      <div className={styles.body}>
        <RecipeFacts recipe={recipe} />

        {nutrition.length ? (
          <section className={styles.nutrition} aria-label="Estimated nutrition per serving">
            <div className={styles.sectionHeading}>
              <h4>Per serving</h4>
              <span>Estimated</span>
            </div>
            {split ? (
              <div
                className={styles.macroBar}
                role="img"
                aria-label={`Share of calories: ${split.map((part) => `${part.label} ${part.percent}%`).join(', ')}`}
              >
                {split.map((part) => (
                  <i
                    key={part.key}
                    data-macro={part.key}
                    style={{ flexGrow: part.percent || 0.4 }}
                  />
                ))}
              </div>
            ) : null}
            <div className={styles.nutritionGrid}>
              {nutrition.map(([label, value, unit]) => (
                <div key={label} data-macro={label.toLowerCase()}>
                  <strong>
                    {value}
                    <small>{unit}</small>
                  </strong>
                  <span>{label}</span>
                </div>
              ))}
            </div>
          </section>
        ) : null}

        <Disclosure
          summary="Ingredients"
          count={plural(ingredientCount, 'item')}
          defaultOpen={ingredientCount <= 8}
        >
          <Ingredients recipe={recipe} />
        </Disclosure>
        {list(recipe.instructionSections).length ? (
          <Disclosure summary="Method">
            <Method recipe={recipe} />
          </Disclosure>
        ) : null}

        {photoBlocked && isCreate && pending ? (
          <p className={styles.photoOff}>
            <ImageOff aria-hidden="true" /> No photo:{' '}
            {delivery?.reason ?? 'image generation is unavailable.'}
          </p>
        ) : null}
        {offerManual && !photoBlocked ? (
          <section className={styles.imageAsk}>
            <p>Photos are a separate paid request. Saving the recipe does not select an image.</p>
            <ActionButton
              icon={Camera}
              disabled={busy || imagePending}
              pending={imagePending}
              onClick={() => void requestImage()}
            >
              {imagePending
                ? 'Preparing image…'
                : imageOperation || text(image?.operationId)
                  ? 'Check this image request'
                  : 'Generate an image preview (paid)'}
            </ActionButton>
          </section>
        ) : null}
        {imageError ? <Callout tone="error">{imageError}</Callout> : null}
      </div>

      {pending ? (
        <CardFooter>
          <ActionButton
            tone="primary"
            icon={Check}
            pending={pendingDecision === 'confirm'}
            onClick={() => onDecide(action.id, 'confirm')}
            disabled={busy || imagePending}
          >
            {pendingDecision === 'confirm'
              ? isCreate
                ? 'Adding recipe…'
                : 'Saving changes…'
              : isCreate
                ? 'Add to My Recipes'
                : 'Save recipe changes'}
          </ActionButton>
          {onRefine ? (
            <ActionButton
              icon={MessageSquarePlus}
              disabled={busy || imagePending}
              onClick={() => onRefine(action.id)}
            >
              Ask for changes
            </ActionButton>
          ) : null}
          <ActionButton
            tone="quiet"
            pending={pendingDecision === 'cancel'}
            onClick={() => onDecide(action.id, 'cancel')}
            disabled={busy || imagePending}
          >
            {pendingDecision === 'cancel' ? 'Cancelling…' : 'Cancel'}
          </ActionButton>
        </CardFooter>
      ) : (
        <div className={styles.outcome} data-status={action.status}>
          {action.status === 'confirmed' ? (
            <>
              <Check aria-hidden="true" /> Added to My Recipes
              {recipeId ? (
                <a
                  href={
                    candidateId
                      ? `/recipes/${recipeId}?imageCandidate=${candidateId}#recipe-photos`
                      : `/recipes/${recipeId}`
                  }
                >
                  {candidateId ? 'Review image before selecting' : 'View recipe'}
                  <ArrowUpRight aria-hidden="true" />
                </a>
              ) : null}
            </>
          ) : (
            <>
              <X aria-hidden="true" />
              {action.status === 'cancelled' ? 'Recipe cancelled' : 'Recipe unavailable'}
            </>
          )}
        </div>
      )}
    </article>
  );
}

const MEAL_ORDER = ['breakfast', 'lunch', 'dinner', 'snack'];

function mealRank(meal: string) {
  const index = MEAL_ORDER.indexOf(meal.toLowerCase());
  return index < 0 ? MEAL_ORDER.length : index;
}

function describeDay(date: string) {
  const parsed = new Date(`${date}T12:00:00`);
  if (Number.isNaN(parsed.getTime())) return { weekday: date, short: date, day: '', label: '' };
  return {
    weekday: parsed.toLocaleDateString(undefined, { weekday: 'long' }),
    short: parsed.toLocaleDateString(undefined, { weekday: 'short' }),
    day: String(parsed.getDate()),
    label: parsed.toLocaleDateString(undefined, { day: 'numeric', month: 'short' }),
  };
}

function describeRange(dates: string[]) {
  if (!dates.length) return '';
  const fmt = (value: string) =>
    new Date(`${value}T12:00:00`).toLocaleDateString(undefined, { day: 'numeric', month: 'short' });
  return dates.length === 1 ? fmt(dates[0]) : `${fmt(dates[0])} – ${fmt(dates.at(-1)!)}`;
}

/** Identity of a drafted meal. A replaced meal gets a new title, so it comes back unreviewed. */
export const mealKey = (plannedFor: string, meal: string, title: string) =>
  `${plannedFor}|${meal}|${title}`;

const SWAP_UNDO_MS = 3000;

function GenericProposalCard({
  action,
  busy,
  pendingDecision,
  onDecide,
  onRevise,
  keptMeals,
  onKeptMealsChange,
}: {
  onRevise?: (actionId: string, plannedFor: string, meal: string) => void;
  /** Meals the person has marked as kept; lifted so they survive a replaced draft. */
  keptMeals?: ReadonlySet<string>;
  onKeptMealsChange?: (next: Set<string>) => void;
  action: AiDrawerAction;
  busy: boolean;
  pendingDecision: 'confirm' | 'cancel' | null;
  onDecide: DecideHandler;
}) {
  const [resolutions, setResolutions] = useState<Record<string, 'keep' | 'replace'>>({});
  const [revising, setRevising] = useState<string | null>(null);
  const [localKept, setLocalKept] = useState<ReadonlySet<string>>(new Set());
  const [swap, setSwap] = useState<string | null>(null);
  const swapTimer = useRef<number | null>(null);
  const [photos, setPhotos] = useState(true);
  const [openDays, setOpenDays] = useState<Set<string> | null>(null);
  const preview = object(action.preview) ?? {};
  const candidate = object(preview.candidate);
  const entries = (
    list(candidate?.entries).length
      ? list(candidate?.entries)
      : object(preview.entry)
        ? [preview.entry]
        : []
  )
    .map(object)
    .filter((entry): entry is Record<string, unknown> => entry !== null);
  const newRecipes = list(candidate?.newRecipes)
    .map(object)
    .filter((entry): entry is Record<string, unknown> => entry !== null);
  const conflicts = list(preview.conflicts)
    .map(object)
    .filter((item): item is Record<string, unknown> => item !== null);
  const needsChoices = object(preview.request)?.occupiedSlotMode === 'review';
  const unresolvedCount = needsChoices
    ? conflicts.filter((item) => !resolutions[text(item.entryId)]).length
    : 0;
  const isPlan = action.kind === 'meal_plan_generate' || action.kind === 'meal_plan_change';
  const labels: Record<string, string> = {
    meal_plan_generate: 'Draft meal plan',
    meal_plan_change: 'Meal plan change',
    nutrition_entry: 'Nutrition entry',
  };
  const dates = [...new Set(entries.map((entry) => text(entry.plannedFor)))].filter(Boolean).sort();
  const savedCount = entries.filter((entry) => text(entry.existingRecipeId)).length;
  const draftCount = newRecipes.length;
  const members = Array.isArray(preview.selectedProfileIds) ? preview.selectedProfileIds.length : 0;
  const assumptions = list(candidate?.assumptions).map(text).filter(Boolean);
  const warnings = list(candidate?.warnings).map(text).filter(Boolean);
  const result = object(action.result);
  const shoppingListId = text(result?.shoppingListId);
  const pending = action.status === 'pending';
  const title = entries.length
    ? `${plural(entries.length, 'meal')} · ${describeRange(dates)}`
    : (labels[action.kind] ?? 'Proposed change');
  const subtitle = entries.length
    ? members
      ? `For ${plural(members, 'household member')}`
      : undefined
    : text(preview.operation) || 'This change is ready for your review.';
  const delivery = action.kind === 'meal_plan_generate' ? (action.imageDelivery ?? null) : null;
  const wantsPhotos = Boolean(pending && delivery?.available && photos && draftCount > 0);
  // Long plans open one day at a time so the card stays scannable.
  const expanded = openDays ?? new Set(dates.length <= 3 ? dates : dates.slice(0, 1));
  const allOpen = dates.every((date) => expanded.has(date));
  const kept = keptMeals ?? localKept;
  const setKept = onKeptMealsChange ?? setLocalKept;
  const keyOf = (entry: Record<string, unknown>) =>
    mealKey(text(entry.plannedFor), text(entry.meal), text(entry.title) || 'Planned meal');
  const keptCount = entries.filter((entry) => kept.has(keyOf(entry))).length;
  const reviewable = Boolean(pending && entries.length);
  const toggleKept = (keys: string[], on: boolean) => {
    const next = new Set(kept);
    for (const key of keys) {
      if (on) next.add(key);
      else next.delete(key);
    }
    setKept(next);
  };
  const dayEntries = (date: string) =>
    entries
      .filter((entry) => text(entry.plannedFor) === date)
      .sort((a, b) => mealRank(text(a.meal)) - mealRank(text(b.meal)));
  const setDayOpen = (date: string, open: boolean) => {
    const next = new Set(expanded);
    if (open) next.add(date);
    else next.delete(date);
    setOpenDays(next);
  };
  // A swap is sent after a short undo window, so a stray swipe never costs an AI request.
  const startSwap = (key: string, identity: string, date: string, meal: string) => {
    if (!onRevise || busy || swap) return;
    toggleKept([identity], false);
    setSwap(key);
    swapTimer.current = window.setTimeout(() => {
      swapTimer.current = null;
      setSwap(null);
      setRevising(key);
      onRevise(action.id, date, meal);
    }, SWAP_UNDO_MS);
  };
  const undoSwap = () => {
    if (swapTimer.current !== null) window.clearTimeout(swapTimer.current);
    swapTimer.current = null;
    setSwap(null);
  };
  useEffect(
    () => () => {
      if (swapTimer.current !== null) window.clearTimeout(swapTimer.current);
    },
    [],
  );

  return (
    <article
      className={cards.card}
      aria-busy={busy}
      aria-label={`${labels[action.kind] ?? 'Proposed change'}${entries.length ? `: ${title}` : ''}`}
    >
      <CardHead
        icon={isPlan ? CalendarDays : ChefHat}
        eyebrow={labels[action.kind] ?? 'Proposed change'}
        title={title}
        subtitle={subtitle}
        status={action.status}
      />

      {entries.length ? (
        <div className={styles.body}>
          <dl className={styles.stats} aria-label="Plan summary">
            <div>
              <dt>Days</dt>
              <dd>{dates.length}</dd>
            </div>
            <div>
              <dt>Meals</dt>
              <dd>{entries.length}</dd>
            </div>
            <div>
              <dt>Your recipes</dt>
              <dd>{savedCount}</dd>
            </div>
            <div>
              <dt>New</dt>
              <dd>{draftCount}</dd>
            </div>
          </dl>

          {pending ? (
            <PaidPhotoSwitch
              delivery={delivery}
              checked={photos}
              onChange={setPhotos}
              disabled={busy}
              recipes={draftCount}
            />
          ) : null}

          {reviewable ? (
            <section className={styles.review} aria-label="Review progress">
              <div className={styles.reviewTop}>
                <strong>
                  {keptCount} of {entries.length} kept
                </strong>
                <ActionButton
                  tone="quiet"
                  disabled={busy || swap !== null}
                  onClick={() => toggleKept(entries.map(keyOf), keptCount !== entries.length)}
                >
                  {keptCount === entries.length ? 'Clear all' : 'Keep all'}
                </ActionButton>
              </div>
              <div
                className={styles.reviewTrack}
                role="progressbar"
                aria-label="Meals kept"
                aria-valuemin={0}
                aria-valuemax={entries.length}
                aria-valuenow={keptCount}
              >
                <i style={{ width: `${(keptCount / entries.length) * 100}%` }} />
              </div>
              <p className={styles.lead}>
                This is a draft — nothing is saved yet. Tap ✓ Keep or ✗ Change on a meal, or swipe
                it right to keep and left to change. Swipe a whole day right to keep all of its
                meals.
              </p>
            </section>
          ) : null}

          {dates.length > 1 ? (
            <div className={styles.dayTools}>
              <ActionButton
                tone="quiet"
                onClick={() => setOpenDays(allOpen ? new Set() : new Set(dates))}
              >
                {allOpen ? 'Collapse all days' : 'Expand all days'}
              </ActionButton>
            </div>
          ) : null}

          {dates.map((date) => {
            const day = describeDay(date);
            const meals = dayEntries(date);
            const isOpen = expanded.has(date);
            const dayKeys = meals.map(keyOf);
            const dayKept = dayKeys.length > 0 && dayKeys.every((key) => kept.has(key));
            const panelId = `plan-${action.id}-${date}`;
            return (
              <section
                key={date}
                className={styles.day}
                data-state={dayKept ? 'kept' : undefined}
                aria-label={`${day.weekday} ${day.label}`}
              >
                <SwipeRow
                  className={styles.dayHeadWrap}
                  contentClassName={styles.dayHeadRow}
                  disabled={!reviewable || busy || swap !== null}
                  ignore="a,input,select,textarea,[data-no-swipe]"
                  rightLabel="Keep day"
                  leftLabel="Clear day"
                  onSwipeRight={
                    reviewable
                      ? () => {
                          toggleKept(dayKeys, true);
                          setDayOpen(date, false);
                        }
                      : undefined
                  }
                  onSwipeLeft={reviewable ? () => toggleKept(dayKeys, false) : undefined}
                >
                  <button
                    type="button"
                    className={styles.dayToggle}
                    aria-expanded={isOpen}
                    aria-controls={panelId}
                    onClick={() => setDayOpen(date, !isOpen)}
                  >
                    <span className={styles.dayDate} aria-hidden="true">
                      <small>{day.short}</small>
                      <b>{day.day}</b>
                    </span>
                    <span className={styles.dayCopy}>
                      <strong>
                        {day.weekday} <small>{day.label}</small>
                      </strong>
                      <span>
                        {meals.map((meal) => text(meal.title) || 'Planned meal').join(' · ')}
                      </span>
                    </span>
                    <ChevronDown
                      className={styles.dayChevron}
                      aria-hidden="true"
                      data-open={isOpen}
                    />
                  </button>
                  {reviewable ? (
                    <button
                      type="button"
                      className={styles.dayKeep}
                      data-no-swipe
                      aria-pressed={dayKept}
                      aria-label={`Keep every meal on ${day.weekday} ${day.label}`}
                      disabled={busy || swap !== null}
                      onClick={() => {
                        toggleKept(dayKeys, !dayKept);
                        if (!dayKept) setDayOpen(date, false);
                      }}
                    >
                      <Check aria-hidden="true" />
                      <span>{dayKept ? 'Kept' : 'Keep day'}</span>
                    </button>
                  ) : null}
                </SwipeRow>
                <ul className={styles.meals} id={panelId} hidden={!isOpen}>
                  {meals.map((meal, index) => {
                    const key = `${date}:${text(meal.meal)}:${index}`;
                    const identity = keyOf(meal);
                    const isKept = kept.has(identity);
                    const recipeEntry = newRecipes.find(
                      (item) => item.key !== undefined && item.key === meal.newRecipeKey,
                    );
                    const recipe = object(recipeEntry?.recipe);
                    const savedId = text(meal.existingRecipeId);
                    const mealName = text(meal.meal);
                    const mealTitle = text(meal.title) || 'Planned meal';
                    const replacing = busy && revising === key;
                    const undoing = swap === key;
                    const kcal = recipe ? text(recipe.nutritionCalories) : '';
                    const minutes = recipe
                      ? number(recipe.prepMinutes) +
                        number(recipe.cookMinutes) +
                        number(recipe.restMinutes)
                      : 0;
                    const mealState = replacing || undoing ? 'changing' : isKept ? 'kept' : 'open';
                    return (
                      <li key={key} className={styles.mealItem}>
                        <SwipeRow
                          className={styles.meal}
                          contentClassName={styles.mealRow}
                          state={mealState}
                          disabled={!reviewable || busy || swap !== null}
                          rightLabel="Keep"
                          leftLabel="Change"
                          onSwipeRight={reviewable ? () => toggleKept([identity], true) : undefined}
                          onSwipeLeft={
                            reviewable && onRevise
                              ? () => startSwap(key, identity, text(meal.plannedFor), mealName)
                              : undefined
                          }
                        >
                          <span className={styles.mealTag} data-meal={mealName.toLowerCase()}>
                            {mealName}
                          </span>
                          <div className={styles.mealMain}>
                            <div className={styles.mealTitleRow}>
                              {savedId ? (
                                <Link
                                  className={styles.mealTitle}
                                  href={`/recipes/${encodeURIComponent(savedId)}`}
                                >
                                  {mealTitle}
                                  <ArrowUpRight aria-hidden="true" />
                                </Link>
                              ) : (
                                <strong className={styles.mealTitle}>{mealTitle}</strong>
                              )}
                              <span
                                className={styles.source}
                                data-source={savedId ? 'saved' : 'new'}
                              >
                                {savedId ? 'Saved recipe' : 'New draft'}
                              </span>
                            </div>
                            <p className={styles.mealMeta}>
                              {[
                                text(meal.servings) ? `${text(meal.servings)} servings` : '',
                                minutes ? `${minutes} min` : '',
                                kcal ? `${kcal} kcal` : '',
                                text(meal.note),
                              ]
                                .filter(Boolean)
                                .join(' · ')}
                            </p>
                            {recipe ? (
                              <Disclosure
                                summary="View recipe"
                                count={plural(countIngredients(recipe), 'ingredient')}
                              >
                                {text(recipe.summary) ? <p>{text(recipe.summary)}</p> : null}
                                <Ingredients recipe={recipe} />
                                <Method recipe={recipe} />
                              </Disclosure>
                            ) : null}
                            {reviewable ? (
                              undoing ? (
                                <div className={styles.undoBar} role="status">
                                  <span>Finding a replacement…</span>
                                  <ActionButton
                                    tone="quiet"
                                    className={styles.undoButton}
                                    onClick={undoSwap}
                                  >
                                    Undo
                                  </ActionButton>
                                </div>
                              ) : replacing ? (
                                <div className={styles.undoBar} role="status">
                                  <span>
                                    <ButtonSpinner /> Finding another {mealName}…
                                  </span>
                                </div>
                              ) : (
                                <div className={styles.mealActions} data-no-swipe>
                                  <ActionButton
                                    tone="quiet"
                                    icon={Check}
                                    className={styles.keepBtn}
                                    aria-pressed={isKept}
                                    aria-label={`Keep ${mealName} on ${day.weekday} ${day.label}: ${mealTitle}`}
                                    disabled={busy || swap !== null}
                                    onClick={() => toggleKept([identity], !isKept)}
                                  >
                                    {isKept ? 'Kept' : 'Keep'}
                                  </ActionButton>
                                  {onRevise ? (
                                    <ActionButton
                                      tone="quiet"
                                      icon={X}
                                      className={styles.changeBtn}
                                      aria-label={`Not for me, replace ${mealName} on ${day.weekday} ${day.label}: ${mealTitle}`}
                                      disabled={busy || swap !== null}
                                      onClick={() =>
                                        startSwap(key, identity, text(meal.plannedFor), mealName)
                                      }
                                    >
                                      Change
                                    </ActionButton>
                                  ) : null}
                                </div>
                              )
                            ) : null}
                          </div>
                        </SwipeRow>
                      </li>
                    );
                  })}
                </ul>
              </section>
            );
          })}

          {assumptions.length ? (
            <Disclosure summary="Planning assumptions" count={assumptions.length}>
              {assumptions.map((assumption, index) => (
                <p key={index}>{assumption}</p>
              ))}
            </Disclosure>
          ) : null}
          {warnings.length ? (
            <Callout tone="warning">
              {warnings.map((warning, index) => (
                <p key={index}>{warning}</p>
              ))}
            </Callout>
          ) : null}
        </div>
      ) : null}

      {conflicts.length ? (
        <section className={styles.conflicts} aria-label="Existing meal choices">
          <h4>
            Already planned <small>{conflicts.length}</small>
          </h4>
          {conflicts.map((conflict) => {
            const id = text(conflict.entryId);
            const choice = resolutions[id];
            const conflictDay = describeDay(text(conflict.plannedFor));
            const label = `${conflictDay.weekday} ${conflictDay.label} · ${text(conflict.meal)} · ${text(conflict.title)}`;
            return (
              <div key={id} className={styles.conflict}>
                <span>{label}</span>
                {needsChoices && pending ? (
                  <div
                    role="group"
                    aria-label={`Keep or replace ${text(conflict.title)}`}
                    className={styles.segment}
                  >
                    {(['keep', 'replace'] as const).map((option) => (
                      <button
                        key={option}
                        type="button"
                        aria-pressed={choice === option}
                        onClick={() => setResolutions((current) => ({ ...current, [id]: option }))}
                      >
                        {option === 'keep' ? 'Keep existing' : 'Use new meal'}
                      </button>
                    ))}
                  </div>
                ) : (
                  <small>
                    {object(preview.request)?.occupiedSlotMode === 'replace'
                      ? 'Will be replaced'
                      : 'Will be kept'}
                  </small>
                )}
              </div>
            );
          })}
        </section>
      ) : null}

      {!pending && action.status === 'confirmed' && isPlan ? (
        <div className={styles.body}>
          <ImageOutcome result={result} />
          {action.kind === 'meal_plan_generate' && shoppingListId ? (
            <Link className={styles.listLink} href={`/lists/${encodeURIComponent(shoppingListId)}`}>
              <ShoppingBasket aria-hidden="true" /> Open this plan’s shopping list
              <ArrowUpRight aria-hidden="true" />
            </Link>
          ) : null}
        </div>
      ) : null}

      {pending ? (
        <CardFooter
          note={
            unresolvedCount
              ? `Choose what happens to ${plural(unresolvedCount, 'occupied slot')} to continue.`
              : isPlan
                ? `Saving also creates a shopping list that accounts for your pantry. Meals not listed stay unchanged.${wantsPhotos ? ' Photos are created after saving.' : ''}`
                : undefined
          }
        >
          <ActionButton
            tone="primary"
            icon={Check}
            pending={pendingDecision === 'confirm'}
            onClick={() =>
              onDecide(
                action.id,
                'confirm',
                Object.entries(resolutions).map(([entryId, resolution]) => ({
                  entryId,
                  resolution,
                })),
                { generateImages: wantsPhotos },
              )
            }
            disabled={busy || unresolvedCount > 0}
          >
            {pendingDecision === 'confirm'
              ? 'Saving…'
              : isPlan
                ? wantsPhotos
                  ? 'Confirm plan + photos'
                  : 'Confirm plan'
                : 'Confirm'}
          </ActionButton>
          <ActionButton
            pending={pendingDecision === 'cancel'}
            onClick={() => onDecide(action.id, 'cancel')}
            disabled={busy}
          >
            {pendingDecision === 'cancel' ? 'Cancelling…' : 'Cancel'}
          </ActionButton>
        </CardFooter>
      ) : (
        <div className={styles.outcome} data-status={action.status}>
          {action.status === 'confirmed' ? <Check aria-hidden="true" /> : <X aria-hidden="true" />}
          {action.status === 'confirmed'
            ? isPlan
              ? 'Meal plan saved'
              : 'Saved'
            : action.status === 'cancelled'
              ? 'Cancelled — nothing was saved'
              : action.status === 'superseded'
                ? 'Replaced by a newer draft'
                : action.status}
        </div>
      )}
    </article>
  );
}

function RecipeBatchProposalCard({
  action,
  busy,
  pendingDecision,
  onDecide,
}: {
  action: AiDrawerAction;
  busy: boolean;
  pendingDecision: 'confirm' | 'cancel' | null;
  onDecide: DecideHandler;
}) {
  const [photos, setPhotos] = useState(true);
  const preview = object(action.preview) ?? {};
  const recipes = list(preview.recipes).map(object).filter(Boolean);
  const name = (recipe: Record<string, unknown> | null) => text(recipe?.title) || 'Untitled recipe';
  const pending = action.status === 'pending';
  const delivery = action.imageDelivery ?? null;
  const wantsPhotos = Boolean(pending && delivery?.available && photos);
  return (
    <article className={cards.card} aria-label="Recipe batch proposal" aria-busy={busy}>
      <CardHead
        icon={Layers3}
        eyebrow="Recipe set"
        title={`${recipes.length} new recipes`}
        subtitle="Review the set, then add them all to My Recipes."
        status={action.status}
      />
      <div className={styles.body}>
        <ol className={styles.batch}>
          {recipes.slice(0, 4).map((recipe, index) => (
            <li key={`${name(recipe)}-${index}`}>
              <span aria-hidden="true">{index + 1}</span>
              {name(recipe)}
            </li>
          ))}
        </ol>
        {recipes.length > 4 ? (
          <Disclosure summary={`View all ${recipes.length} recipes`}>
            <ol className={styles.batch} start={5}>
              {recipes.slice(4).map((recipe, index) => (
                <li key={index}>
                  <span aria-hidden="true">{index + 5}</span>
                  {name(recipe)}
                </li>
              ))}
            </ol>
          </Disclosure>
        ) : null}
        {pending ? (
          <PaidPhotoSwitch
            delivery={delivery}
            checked={photos}
            onChange={setPhotos}
            disabled={busy}
            recipes={recipes.length}
          />
        ) : action.status === 'confirmed' ? (
          <ImageOutcome result={object(action.result)} />
        ) : null}
      </div>
      {pending ? (
        <CardFooter>
          <ActionButton
            tone="primary"
            icon={Check}
            pending={pendingDecision === 'confirm'}
            onClick={() =>
              onDecide(action.id, 'confirm', undefined, { generateImages: wantsPhotos })
            }
            disabled={busy}
          >
            {pendingDecision === 'confirm'
              ? 'Adding…'
              : wantsPhotos
                ? 'Add all + create photos'
                : 'Add all to My Recipes'}
          </ActionButton>
          <ActionButton
            pending={pendingDecision === 'cancel'}
            onClick={() => onDecide(action.id, 'cancel')}
            disabled={busy}
          >
            {pendingDecision === 'cancel' ? 'Cancelling…' : 'Cancel'}
          </ActionButton>
        </CardFooter>
      ) : (
        <div className={styles.outcome} data-status={action.status}>
          {action.status === 'confirmed' ? <Check aria-hidden="true" /> : <X aria-hidden="true" />}
          {action.status === 'confirmed'
            ? `${recipes.length} recipes saved to My Recipes.`
            : action.status}
        </div>
      )}
    </article>
  );
}

export function AiActionCard(props: {
  onRevise?: (actionId: string, plannedFor: string, meal: string) => void;
  onRefine?: (actionId: string) => void;
  keptMeals?: ReadonlySet<string>;
  onKeptMealsChange?: (next: Set<string>) => void;
  action: AiDrawerAction;
  busy: boolean;
  /** Start the draft's photo automatically (live drafts only; older drafts never spend). */
  autoImage?: boolean;
  pendingDecision?: 'confirm' | 'cancel' | null;
  onDecide: DecideHandler;
}) {
  const normalizedProps = { ...props, pendingDecision: props.pendingDecision ?? null };
  if (props.action.kind === 'recipe_create' || props.action.kind === 'recipe_update') {
    return <RecipeProposalCard {...normalizedProps} />;
  }
  if (props.action.kind === 'recipe_batch_create') {
    return <RecipeBatchProposalCard {...normalizedProps} />;
  }
  return <GenericProposalCard {...normalizedProps} />;
}
