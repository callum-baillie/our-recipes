'use client';

import {
  ArrowUpRight,
  CalendarDays,
  Check,
  ChefHat,
  Clock3,
  ImagePlus,
  Layers3,
  RefreshCw,
  ShoppingBasket,
  Users,
  X,
} from 'lucide-react';
import Image from 'next/image';
import Link from 'next/link';
import { useState } from 'react';

import { AsyncSkeleton } from '@/components/skeleton';
import { ActionButton, Callout, CardFooter, CardHead, Disclosure } from './chat-ui/card-parts';
import cards from './chat-ui/cards.module.css';

import styles from './ai-action-card.module.css';

export type AiDrawerAction = {
  id: string;
  kind: string;
  preview: unknown;
  status: string;
  result?: unknown;
  sourceDigest?: string | null;
};

type Resolution = Array<{ entryId: string; resolution: 'keep' | 'replace' }>;
type DecideHandler = (
  actionId: string,
  decision: 'confirm' | 'cancel',
  resolutions?: Resolution,
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
  return typeof value === 'number' && Number.isFinite(value) ? value : 0;
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

function RecipeProposalCard({
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
  const preview = object(action.preview) ?? {};
  const recipe = object(action.kind === 'recipe_update' ? preview.after : preview.recipe);
  const [localAction, setLocalAction] = useState<AiDrawerAction | null>(null);
  const [imagePending, setImagePending] = useState(false);
  const [imageError, setImageError] = useState('');
  const [imageOperation, setImageOperation] = useState<string | null>(null);
  const image = object(object(localAction?.preview)?.image ?? preview.image);
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
  if (!recipe) return null;

  const nutrition = [
    ['Calories', text(recipe.nutritionCalories), 'kcal'],
    ['Protein', text(recipe.nutritionProteinGrams), 'g'],
    ['Carbs', text(recipe.nutritionCarbohydrateGrams), 'g'],
    ['Fat', text(recipe.nutritionFatGrams), 'g'],
    ['Fiber', text(recipe.nutritionFiberGrams), 'g'],
    ['Sodium', text(recipe.nutritionSodiumMilligrams), 'mg'],
  ].filter(([, value]) => value !== '');
  const imageReady = text(image?.status) === 'ready' && !imageFailed;
  const imageGenerating = imagePending || ['requested', 'generating'].includes(text(image?.status));
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

  return (
    <article
      className={cards.card}
      aria-label={`Recipe proposal: ${title}`}
      aria-busy={pendingDecision !== null}
    >
      <CardHead
        icon={ChefHat}
        eyebrow={isCreate ? 'Recipe draft' : 'Recipe changes'}
        title={title}
        subtitle={text(recipe.summary) || undefined}
        status={action.status}
      />

      {imageReady || imageGenerating ? (
        <div className={styles.hero}>
          {imageReady ? (
            <Image
              src={imageSource}
              alt={text(image?.altText) || `AI-generated preview of ${title}`}
              fill
              sizes="(max-width: 540px) 100vw, 420px"
              unoptimized
              onError={() => setImageFailed(true)}
            />
          ) : (
            <div className={styles.imageFallback}>
              <AsyncSkeleton label="Generating preview image" variant="image" />
              <span>
                {imagePending
                  ? 'Preparing an image preview…'
                  : 'Image request awaiting its recorded result'}
              </span>
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
            <div className={styles.nutritionGrid}>
              {nutrition.map(([label, value, unit]) => (
                <div key={label}>
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
          count={`${ingredientCount} ${ingredientCount === 1 ? 'item' : 'items'}`}
          defaultOpen={ingredientCount <= 8}
        >
          <Ingredients recipe={recipe} />
        </Disclosure>
        {list(recipe.instructionSections).length ? (
          <Disclosure summary="Method">
            <Method recipe={recipe} />
          </Disclosure>
        ) : null}

        {isCreate && action.status === 'pending' && action.sourceDigest && !imageReady ? (
          <section className={styles.imageAsk}>
            <p>
              Optional image: a separate paid request sends this reviewed recipe to the image
              provider. Saving the recipe does not select an image.
            </p>
            <ActionButton
              icon={ImagePlus}
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
            {imageError ? <Callout tone="error">{imageError}</Callout> : null}
            {['failed', 'cancelled'].includes(text(image?.status)) ? (
              <>
                <p>
                  The previous request ended without an available preview. A new request may incur
                  another charge.
                </p>
                <ActionButton
                  disabled={busy || imagePending}
                  onClick={() => void requestImage(true)}
                >
                  Start a new paid image request
                </ActionButton>
              </>
            ) : null}
          </section>
        ) : null}
      </div>

      {action.status === 'pending' ? (
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
          <ActionButton
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
  if (Number.isNaN(parsed.getTime())) return { weekday: date, label: '' };
  return {
    weekday: parsed.toLocaleDateString(undefined, { weekday: 'long' }),
    label: parsed.toLocaleDateString(undefined, { day: 'numeric', month: 'short' }),
  };
}

function describeRange(dates: string[]) {
  if (!dates.length) return '';
  const fmt = (value: string) =>
    new Date(`${value}T12:00:00`).toLocaleDateString(undefined, { day: 'numeric', month: 'short' });
  return dates.length === 1 ? fmt(dates[0]) : `${fmt(dates[0])} – ${fmt(dates.at(-1)!)}`;
}

function GenericProposalCard({
  action,
  busy,
  pendingDecision,
  onDecide,
  onRevise,
}: {
  onRevise?: (actionId: string, plannedFor: string, meal: string) => void;
  action: AiDrawerAction;
  busy: boolean;
  pendingDecision: 'confirm' | 'cancel' | null;
  onDecide: DecideHandler;
}) {
  const [resolutions, setResolutions] = useState<Record<string, 'keep' | 'replace'>>({});
  const [revising, setRevising] = useState<string | null>(null);
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
  const draftCount = entries.length - savedCount;
  const members = Array.isArray(preview.selectedProfileIds) ? preview.selectedProfileIds.length : 0;
  const assumptions = list(candidate?.assumptions).map(text).filter(Boolean);
  const warnings = list(candidate?.warnings).map(text).filter(Boolean);
  const shoppingListId = text(object(action.result)?.shoppingListId);
  const pending = action.status === 'pending';
  const title = entries.length
    ? `${entries.length} meal${entries.length === 1 ? '' : 's'} · ${describeRange(dates)}`
    : (labels[action.kind] ?? 'Proposed change');
  const subtitle = entries.length
    ? [
        members ? `For ${members} household member${members === 1 ? '' : 's'}` : '',
        savedCount ? `${savedCount} from your recipes` : '',
        draftCount ? `${draftCount} new` : '',
      ]
        .filter(Boolean)
        .join(' · ')
    : text(preview.operation) || 'This change is ready for your review.';

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
          {pending ? (
            <p className={styles.lead}>
              This is a draft. Skip any meal that is not for you and I will swap only that one.
            </p>
          ) : null}
          {dates.map((date) => {
            const day = describeDay(date);
            const meals = entries
              .filter((entry) => text(entry.plannedFor) === date)
              .sort((a, b) => mealRank(text(a.meal)) - mealRank(text(b.meal)));
            return (
              <section key={date} className={styles.day} aria-label={`${day.weekday} ${day.label}`}>
                <h4 className={styles.dayHead}>
                  <span>{day.weekday}</span>
                  <small>{day.label}</small>
                </h4>
                <ul className={styles.meals}>
                  {meals.map((meal, index) => {
                    const key = `${date}:${text(meal.meal)}:${index}`;
                    const recipeEntry = newRecipes.find(
                      (item) => item.key !== undefined && item.key === meal.newRecipeKey,
                    );
                    const recipe = object(recipeEntry?.recipe);
                    const savedId = text(meal.existingRecipeId);
                    const mealName = text(meal.meal);
                    const title = text(meal.title) || 'Planned meal';
                    const replacing = busy && revising === key;
                    return (
                      <li key={key} className={styles.meal} data-meal={mealName.toLowerCase()}>
                        <span className={styles.mealTag}>{mealName}</span>
                        <div className={styles.mealMain}>
                          <div className={styles.mealTitleRow}>
                            {savedId ? (
                              <Link
                                className={styles.mealTitle}
                                href={`/recipes/${encodeURIComponent(savedId)}`}
                              >
                                {title}
                                <ArrowUpRight aria-hidden="true" />
                              </Link>
                            ) : (
                              <strong className={styles.mealTitle}>{title}</strong>
                            )}
                            <span className={styles.source} data-source={savedId ? 'saved' : 'new'}>
                              {savedId ? 'Saved recipe' : 'New draft'}
                            </span>
                          </div>
                          <p className={styles.mealMeta}>
                            {text(meal.servings)} servings
                            {text(meal.note) ? ` · ${text(meal.note)}` : ''}
                          </p>
                          {recipe ? (
                            <Disclosure
                              summary="View recipe"
                              count={`${countIngredients(recipe)} ingredients`}
                            >
                              {text(recipe.summary) ? <p>{text(recipe.summary)}</p> : null}
                              <Ingredients recipe={recipe} />
                              <Method recipe={recipe} />
                            </Disclosure>
                          ) : null}
                          {pending && onRevise ? (
                            <ActionButton
                              tone="quiet"
                              icon={RefreshCw}
                              pending={replacing}
                              disabled={busy}
                              aria-label={`Not for me, replace ${mealName} on ${day.weekday} ${day.label}: ${title}`}
                              className={styles.swap}
                              onClick={() => {
                                setRevising(key);
                                onRevise(action.id, text(meal.plannedFor), text(meal.meal));
                              }}
                            >
                              {replacing ? 'Finding another…' : 'Not for me · swap'}
                            </ActionButton>
                          ) : null}
                        </div>
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

      {action.kind === 'meal_plan_generate' && shoppingListId ? (
        <div className={styles.body}>
          <Link className={styles.listLink} href={`/lists/${encodeURIComponent(shoppingListId)}`}>
            <ShoppingBasket aria-hidden="true" /> Open this plan’s shopping list
            <ArrowUpRight aria-hidden="true" />
          </Link>
        </div>
      ) : null}

      {pending ? (
        <CardFooter
          note={
            unresolvedCount
              ? `Choose what happens to ${unresolvedCount} occupied ${unresolvedCount === 1 ? 'slot' : 'slots'} to continue.`
              : isPlan
                ? 'Saving also creates a shopping list that accounts for your pantry. Meals not listed stay unchanged.'
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
              )
            }
            disabled={busy || unresolvedCount > 0}
          >
            {pendingDecision === 'confirm' ? 'Saving…' : isPlan ? 'Confirm plan' : 'Confirm'}
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
  const preview = object(action.preview) ?? {};
  const recipes = list(preview.recipes).map(object).filter(Boolean);
  const name = (recipe: Record<string, unknown> | null) => text(recipe?.title) || 'Untitled recipe';
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
      </div>
      {action.status === 'pending' ? (
        <CardFooter>
          <ActionButton
            tone="primary"
            icon={Check}
            pending={pendingDecision === 'confirm'}
            onClick={() => onDecide(action.id, 'confirm')}
            disabled={busy}
          >
            {pendingDecision === 'confirm' ? 'Adding…' : 'Add all to My Recipes'}
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
  action: AiDrawerAction;
  busy: boolean;
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
