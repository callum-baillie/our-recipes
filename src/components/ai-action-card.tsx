'use client';

import { Check, Clock3, ImageOff, Layers3, Sparkles, Users } from 'lucide-react';
import Image from 'next/image';
import Link from 'next/link';
import { useState } from 'react';

import { AsyncSkeleton, LoadingIndicator } from '@/components/skeleton';

import styles from './ai-action-card.module.css';

export type AiDrawerAction = {
  id: string;
  kind: string;
  preview: unknown;
  status: string;
  result?: unknown;
  sourceDigest?: string | null;
};

function object(value: unknown): Record<string, unknown> | null {
  return value !== null && typeof value === 'object' && !Array.isArray(value)
    ? (value as Record<string, unknown>)
    : null;
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

function RecipeProposalCard({
  action,
  busy,
  pendingDecision,
  onDecide,
}: {
  action: AiDrawerAction;
  busy: boolean;
  pendingDecision: 'confirm' | 'cancel' | null;
  onDecide: (
    actionId: string,
    decision: 'confirm' | 'cancel',
    resolutions?: Array<{ entryId: string; resolution: 'keep' | 'replace' }>,
  ) => void;
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

  const ingredientGroups = Array.isArray(recipe.ingredientGroups) ? recipe.ingredientGroups : [];
  const nutrition = [
    ['Calories', text(recipe.nutritionCalories), 'kcal'],
    ['Protein', text(recipe.nutritionProteinGrams), 'g'],
    ['Carbs', text(recipe.nutritionCarbohydrateGrams), 'g'],
    ['Fat', text(recipe.nutritionFatGrams), 'g'],
    ['Fiber', text(recipe.nutritionFiberGrams), 'g'],
    ['Sodium', text(recipe.nutritionSodiumMilligrams), 'mg'],
  ].filter(([, value]) => value !== '');
  const totalMinutes =
    number(recipe.prepMinutes) + number(recipe.cookMinutes) + number(recipe.restMinutes);
  const imageReady = text(image?.status) === 'ready' && !imageFailed;
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

  return (
    <article className={styles.recipeCard} aria-label={`Recipe proposal: ${text(recipe.title)}`}>
      <div className={styles.hero}>
        {imageReady ? (
          <Image
            src={imageSource}
            alt={text(image?.altText) || `AI-generated preview of ${text(recipe.title)}`}
            fill
            sizes="(max-width: 540px) 100vw, 420px"
            unoptimized
            onError={() => setImageFailed(true)}
          />
        ) : (
          <div className={styles.imageFallback}>
            {imagePending || ['requested', 'generating'].includes(text(image?.status)) ? (
              <AsyncSkeleton label="Generating preview image" variant="image" />
            ) : (
              <ImageOff />
            )}
            <span>
              {imagePending
                ? 'Preparing an image preview…'
                : text(image?.status) === 'requested'
                  ? 'Image request awaiting its recorded result'
                  : 'Recipe draft · no image selected'}
            </span>
          </div>
        )}
        <span className={styles.previewPill}>AI recipe preview</span>
      </div>

      <div className={styles.recipeBody}>
        <div className={styles.titleBlock}>
          <h3>{text(recipe.title) || 'Untitled recipe'}</h3>
          {text(recipe.summary) ? <p>{text(recipe.summary)}</p> : null}
        </div>

        <div className={styles.facts} aria-label="Recipe facts">
          {totalMinutes ? (
            <span>
              <Clock3 aria-hidden="true" /> {totalMinutes} min
            </span>
          ) : null}
          {text(recipe.servings) ? (
            <span>
              <Users aria-hidden="true" /> {text(recipe.servings)}
            </span>
          ) : null}
          {text(recipe.difficulty) ? <span>{text(recipe.difficulty)}</span> : null}
        </div>

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

        <section className={styles.ingredients}>
          <div className={styles.sectionHeading}>
            <h4>Ingredients</h4>
            <span>
              {ingredientGroups.reduce((count, groupValue) => {
                const group = object(groupValue);
                return count + (Array.isArray(group?.ingredients) ? group.ingredients.length : 0);
              }, 0)}{' '}
              items
            </span>
          </div>
          {ingredientGroups.map((groupValue, groupIndex) => {
            const group = object(groupValue);
            const ingredients = Array.isArray(group?.ingredients) ? group.ingredients : [];
            return (
              <div className={styles.ingredientGroup} key={`${text(group?.name)}-${groupIndex}`}>
                {text(group?.name) ? <h5>{text(group?.name)}</h5> : null}
                <ul>
                  {ingredients.map((ingredient, ingredientIndex) => (
                    <li key={`${formatIngredient(ingredient)}-${ingredientIndex}`}>
                      {formatIngredient(ingredient)}
                    </li>
                  ))}
                </ul>
              </div>
            );
          })}
        </section>

        {action.kind === 'recipe_create' &&
        action.status === 'pending' &&
        action.sourceDigest &&
        !imageReady ? (
          <section>
            <p>
              Optional image: a separate paid request sends this reviewed recipe to the image
              provider. Saving the recipe does not select an image.
            </p>
            <button
              type="button"
              className={styles.secondaryAction}
              disabled={busy || imagePending}
              onClick={() => void requestImage()}
            >
              {imagePending
                ? 'Preparing image…'
                : imageOperation || text(image?.operationId)
                  ? 'Check this image request'
                  : 'Generate an image preview (paid)'}
            </button>
            {imageError ? <p role="alert">{imageError}</p> : null}
            {['failed', 'cancelled'].includes(text(image?.status)) ? (
              <>
                <p>
                  The previous request ended without an available preview. A new request may incur
                  another charge.
                </p>
                <button
                  type="button"
                  className={styles.secondaryAction}
                  disabled={busy || imagePending}
                  onClick={() => void requestImage(true)}
                >
                  Start a new paid image request
                </button>
              </>
            ) : null}
          </section>
        ) : null}
        {action.status === 'pending' ? (
          <div className={styles.actions}>
            <button
              type="button"
              className={styles.primaryAction}
              onClick={() => onDecide(action.id, 'confirm')}
              disabled={busy || imagePending}
            >
              {pendingDecision === 'confirm' ? (
                <LoadingIndicator label="Saving changes" />
              ) : (
                <Check aria-hidden="true" />
              )}
              {pendingDecision === 'confirm'
                ? action.kind === 'recipe_create'
                  ? 'Adding recipe…'
                  : 'Saving changes…'
                : action.kind === 'recipe_create'
                  ? 'Add to My Recipes'
                  : 'Save recipe changes'}
            </button>
            <button
              type="button"
              className={styles.secondaryAction}
              onClick={() => onDecide(action.id, 'cancel')}
              disabled={busy || imagePending}
            >
              {pendingDecision === 'cancel' ? (
                <>
                  <LoadingIndicator label="Cancelling preview" /> Cancelling…
                </>
              ) : (
                'Cancel'
              )}
            </button>
          </div>
        ) : (
          <div className={styles.decision} data-status={action.status}>
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
                  </a>
                ) : null}
              </>
            ) : (
              <span>
                {action.status === 'cancelled' ? 'Recipe cancelled' : 'Recipe unavailable'}
              </span>
            )}
          </div>
        )}
      </div>
    </article>
  );
}

function GenericProposalCard({
  action,
  busy,
  pendingDecision,
  onDecide,
}: {
  action: AiDrawerAction;
  busy: boolean;
  pendingDecision: 'confirm' | 'cancel' | null;
  onDecide: (
    actionId: string,
    decision: 'confirm' | 'cancel',
    resolutions?: Array<{ entryId: string; resolution: 'keep' | 'replace' }>,
  ) => void;
}) {
  const [resolutions, setResolutions] = useState<Record<string, 'keep' | 'replace'>>({});
  const preview = object(action.preview) ?? {};
  const candidate = object(preview.candidate);
  const entries = Array.isArray(candidate?.entries)
    ? candidate.entries
    : object(preview.entry)
      ? [preview.entry]
      : [];
  const conflicts = Array.isArray(preview.conflicts)
    ? preview.conflicts.map(object).filter((item): item is Record<string, unknown> => item !== null)
    : [];
  const needsChoices = object(preview.request)?.occupiedSlotMode === 'review';
  const unresolved = needsChoices && conflicts.some((item) => !resolutions[text(item.entryId)]);
  const labels: Record<string, string> = {
    meal_plan_generate: 'Meal plan preview',
    meal_plan_change: 'Meal plan change',
    nutrition_entry: 'Nutrition entry',
  };
  return (
    <article className={styles.genericCard}>
      <span className={styles.genericIcon}>
        <Sparkles aria-hidden="true" />
      </span>
      <div>
        <h3>{labels[action.kind] ?? 'Proposed change'}</h3>
        <p>
          {entries.length
            ? `${entries.length} planned meal${entries.length === 1 ? '' : 's'} ready to review.`
            : text(preview.operation) || 'This change is ready for your review.'}
        </p>
      </div>
      {entries.length ? (
        <details className={styles.planPreview} aria-label="Meal plan preview">
          <summary>Review {entries.length} planned meals</summary>
          {[...new Set(entries.map((entry) => text(object(entry)?.plannedFor)))]
            .sort()
            .map((date) => (
              <section key={date}>
                <h4>
                  {new Date(`${date}T12:00:00`).toLocaleDateString(undefined, {
                    weekday: 'short',
                    month: 'short',
                    day: 'numeric',
                  })}
                </h4>
                <ul>
                  {entries
                    .filter((entry) => text(object(entry)?.plannedFor) === date)
                    .map((entry, index) => {
                      const meal = object(entry);
                      return (
                        <li key={index}>
                          <span>{text(meal?.meal)}</span>
                          <strong>{text(meal?.title) || 'Planned meal'}</strong>
                          <small>
                            {text(meal?.servings)} servings
                            {text(meal?.note) ? ` · ${text(meal?.note)}` : ''}
                          </small>
                        </li>
                      );
                    })}
                </ul>
              </section>
            ))}
          {Array.isArray(candidate?.warnings)
            ? candidate.warnings.map((warning, index) => <p key={index}>{text(warning)}</p>)
            : null}
          <p>
            {Array.isArray(preview.selectedProfileIds)
              ? `For ${preview.selectedProfileIds.length} household member${preview.selectedProfileIds.length === 1 ? '' : 's'}. `
              : ''}
            Unlisted meals stay unchanged. Resolve any occupied slots below before saving.
          </p>
          <p>
            Confirming also creates or updates a shopping list for this plan, accounting for your
            pantry stock.
          </p>
        </details>
      ) : null}
      {conflicts.length ? (
        <section className={styles.planPreview} aria-label="Existing meal choices">
          <h4>Already planned</h4>
          {conflicts.map((conflict) => (
            <label key={text(conflict.entryId)}>
              <span>
                {text(conflict.plannedFor)} · {text(conflict.meal)} · {text(conflict.title)}
              </span>
              {needsChoices && action.status === 'pending' ? (
                <select
                  aria-label={`Keep or replace ${text(conflict.title)}`}
                  value={resolutions[text(conflict.entryId)] ?? ''}
                  onChange={(event) =>
                    setResolutions((current) => ({
                      ...current,
                      [text(conflict.entryId)]: event.target.value as 'keep' | 'replace',
                    }))
                  }
                >
                  <option value="" disabled>
                    Choose what happens
                  </option>
                  <option value="keep">Keep existing meal</option>
                  <option value="replace">Replace with proposed meal</option>
                </select>
              ) : (
                <p>
                  {object(preview.request)?.occupiedSlotMode === 'replace'
                    ? 'Will be replaced'
                    : 'Will be kept'}
                </p>
              )}
            </label>
          ))}
        </section>
      ) : null}
      {action.kind === 'meal_plan_generate' && text(object(action.result)?.shoppingListId) ? (
        <Link href={`/lists/${encodeURIComponent(text(object(action.result)?.shoppingListId))}`}>
          Open this plan’s shopping list
        </Link>
      ) : null}
      {action.status === 'pending' ? (
        <div className={styles.actions}>
          <button
            className={styles.primaryAction}
            type="button"
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
            disabled={busy || unresolved}
          >
            {pendingDecision === 'confirm' ? (
              <LoadingIndicator label="Saving changes" />
            ) : (
              <Check aria-hidden="true" />
            )}{' '}
            {pendingDecision === 'confirm' ? 'Saving…' : 'Confirm'}
          </button>
          <button
            className={styles.secondaryAction}
            type="button"
            onClick={() => onDecide(action.id, 'cancel')}
            disabled={busy}
          >
            {pendingDecision === 'cancel' ? (
              <>
                <LoadingIndicator label="Cancelling preview" /> Cancelling…
              </>
            ) : (
              'Cancel'
            )}
          </button>
        </div>
      ) : (
        <p className={styles.genericStatus}>{action.status}</p>
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
  onDecide: (
    actionId: string,
    decision: 'confirm' | 'cancel',
    resolutions?: Array<{ entryId: string; resolution: 'keep' | 'replace' }>,
  ) => void;
}) {
  const preview = object(action.preview) ?? {};
  const recipes = Array.isArray(preview.recipes) ? preview.recipes.map(object).filter(Boolean) : [];
  return (
    <article className={styles.genericCard} aria-label="Recipe batch proposal">
      <span className={styles.genericIcon}>
        <Layers3 aria-hidden="true" />
      </span>
      <div>
        <h3>{recipes.length} new recipes</h3>
        <ul>
          {recipes.slice(0, 4).map((recipe, index) => (
            <li key={`${text(recipe?.title)}-${index}`}>
              {text(recipe?.title) || 'Untitled recipe'}
            </li>
          ))}
        </ul>
        {recipes.length > 4 && (
          <details>
            <summary>View all {recipes.length} recipes</summary>
            <ul>
              {recipes.slice(4).map((recipe, index) => (
                <li key={index}>{text(recipe?.title) || 'Untitled recipe'}</li>
              ))}
            </ul>
          </details>
        )}
      </div>
      {action.status === 'pending' ? (
        <div className={styles.actions}>
          <button
            className={styles.primaryAction}
            type="button"
            onClick={() => onDecide(action.id, 'confirm')}
            disabled={busy}
          >
            {pendingDecision === 'confirm' ? (
              <LoadingIndicator label="Adding recipes" />
            ) : (
              <Check aria-hidden="true" />
            )}
            {pendingDecision === 'confirm' ? 'Adding…' : 'Add all to My Recipes'}
          </button>
          <button
            className={styles.secondaryAction}
            type="button"
            onClick={() => onDecide(action.id, 'cancel')}
            disabled={busy}
          >
            {pendingDecision === 'cancel' ? 'Cancelling…' : 'Cancel'}
          </button>
        </div>
      ) : (
        <p className={styles.genericStatus}>
          {action.status === 'confirmed'
            ? `${recipes.length} recipes saved to My Recipes.`
            : action.status}
        </p>
      )}
    </article>
  );
}

export function AiActionCard(props: {
  action: AiDrawerAction;
  busy: boolean;
  pendingDecision?: 'confirm' | 'cancel' | null;
  onDecide: (
    actionId: string,
    decision: 'confirm' | 'cancel',
    resolutions?: Array<{ entryId: string; resolution: 'keep' | 'replace' }>,
  ) => void;
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
