'use client';

import { Check, Clock3, ImageOff, Layers3, Sparkles, Users } from 'lucide-react';
import Image from 'next/image';
import { useState } from 'react';

import { AsyncSkeleton, InlineSkeleton } from '@/components/skeleton';

import styles from './ai-action-card.module.css';

export type AiDrawerAction = {
  id: string;
  kind: string;
  preview: unknown;
  status: string;
  result?: unknown;
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
  onDecide: (actionId: string, decision: 'confirm' | 'cancel') => void;
}) {
  const preview = object(action.preview) ?? {};
  const recipe = object(action.kind === 'recipe_update' ? preview.after : preview.recipe);
  const image = object(preview.image);
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
  const imageSource =
    action.status === 'confirmed' && recipeId && savedImageId
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
            {text(image?.status) === 'generating' ? (
              <AsyncSkeleton label="Generating preview image" variant="image" />
            ) : (
              <ImageOff />
            )}
            <span>
              {text(image?.status) === 'generating'
                ? 'Creating a serving image…'
                : 'Image preview unavailable'}
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

        {action.status === 'pending' ? (
          <div className={styles.actions}>
            <button
              type="button"
              className={styles.primaryAction}
              onClick={() => onDecide(action.id, 'confirm')}
              disabled={busy}
            >
              {pendingDecision === 'confirm' ? (
                <InlineSkeleton label="Saving changes" width="1rem" />
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
              disabled={busy}
            >
              {pendingDecision === 'cancel' ? (
                <>
                  <InlineSkeleton label="Cancelling preview" width="1rem" /> Cancelling…
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
                {recipeId ? <a href={`/recipes/${recipeId}`}>View recipe</a> : null}
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
  onDecide: (actionId: string, decision: 'confirm' | 'cancel') => void;
}) {
  const preview = object(action.preview) ?? {};
  const candidate = object(preview.candidate);
  const entries = Array.isArray(candidate?.entries) ? candidate.entries : [];
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
      {action.status === 'pending' ? (
        <div className={styles.actions}>
          <button
            className={styles.primaryAction}
            type="button"
            onClick={() => onDecide(action.id, 'confirm')}
            disabled={busy}
          >
            {pendingDecision === 'confirm' ? (
              <InlineSkeleton label="Saving changes" width="1rem" />
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
                <InlineSkeleton label="Cancelling preview" width="1rem" /> Cancelling…
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
  onDecide: (actionId: string, decision: 'confirm' | 'cancel') => void;
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
          {recipes.map((recipe, index) => (
            <li key={`${text(recipe?.title)}-${index}`}>
              {text(recipe?.title) || 'Untitled recipe'}
            </li>
          ))}
        </ul>
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
              <InlineSkeleton label="Adding recipes" width="1rem" />
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
        <p className={styles.genericStatus}>{action.status}</p>
      )}
    </article>
  );
}

export function AiActionCard(props: {
  action: AiDrawerAction;
  busy: boolean;
  pendingDecision?: 'confirm' | 'cancel' | null;
  onDecide: (actionId: string, decision: 'confirm' | 'cancel') => void;
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
