import { ChefHat, Clock3 } from 'lucide-react';
import Image from 'next/image';
import Link from 'next/link';

import { PantryAvailabilityPill } from '@/components/pantry-availability-pill';
import { NutritionVisualMarker } from '@/components/nutrition-visual-marker';
import { RecipeCollectionButton } from '@/components/recipe-collection-button';
import { RecipeReactionButtons } from '@/components/recipe-reaction-buttons';
import type { PantryAvailabilityState } from '@/lib/domain/pantry-availability';

export type RecipeSummaryCardData = {
  id: string;
  title: string;
  summary: string;
  category: string;
  tags: string[];
  servings: string;
  prepMinutes: number;
  cookMinutes: number;
  restMinutes: number;
  personalRating: number | null;
  pantryAvailability?: PantryAvailabilityState;
  pantryInsight?: string;
  normalizedNutrition?: {
    status: 'current' | 'stale' | 'unavailable';
    completeness: number | null;
    facts: Array<{
      code: string;
      label: string;
      amount: number;
      unit: string;
      digits: number;
    }>;
  };
  image: {
    id: string;
    altText: string;
    width: number;
    height: number;
  } | null;
};

export function RecipeSummaryCard({
  recipe,
  compact = false,
  eager = false,
}: {
  recipe: RecipeSummaryCardData;
  compact?: boolean;
  eager?: boolean;
}) {
  const totalMinutes = recipe.prepMinutes + recipe.cookMinutes + recipe.restMinutes;
  const labels = recipe.tags.length ? recipe.tags : recipe.category ? [recipe.category] : [];

  return (
    <article className={`recipe-summary-card${compact ? ' compact' : ''}`}>
      <Link
        className="recipe-summary-card-link"
        href={`/recipes/${recipe.id}`}
        aria-label={`Open ${recipe.title}`}
      >
        <span className="recipe-card-media">
          {recipe.image ? (
            <Image
              src={`/api/v1/recipes/${recipe.id}/images/${recipe.image.id}`}
              alt={recipe.image.altText || recipe.title}
              width={recipe.image.width}
              height={recipe.image.height}
              loading={eager ? 'eager' : 'lazy'}
              sizes={compact ? '(max-width: 850px) 100vw, 320px' : '(max-width: 700px) 100vw, 33vw'}
            />
          ) : (
            <span className="recipe-card-placeholder" aria-hidden="true">
              <ChefHat size={30} />
            </span>
          )}
        </span>
        <span className="recipe-card-copy">
          <span className="recipe-card-labels">
            {labels.slice(0, 3).join(' · ') || 'House recipe'}
          </span>
          <strong>{recipe.title}</strong>
          <span className="recipe-card-description">
            {recipe.summary ||
              `A saved ${recipe.category ? `${recipe.category.toLocaleLowerCase()} ` : ''}recipe ready for your table.`}
          </span>
          <span className="recipe-card-meta">
            <Clock3 size={14} aria-hidden="true" /> {totalMinutes} min
            {recipe.category ? ` · ${recipe.category}` : ''}
          </span>
          {recipe.normalizedNutrition?.status === 'current' ? (
            <span
              className="recipe-card-meta recipe-card-nutrition"
              aria-label="Normalized nutrition per serving"
            >
              {recipe.normalizedNutrition.facts.length
                ? recipe.normalizedNutrition.facts.map((fact) => (
                    <span className="recipe-card-nutrition-fact" key={fact.code}>
                      <NutritionVisualMarker nutrientCode={fact.code} label={fact.label} compact />
                      {Number(fact.amount.toFixed(fact.digits))} {fact.unit}{' '}
                      {fact.label.toLocaleLowerCase()}
                    </span>
                  ))
                : 'Selected per-serving values unknown'}
              {recipe.normalizedNutrition.completeness === null
                ? ' · coverage unknown'
                : ` · ${Math.round(recipe.normalizedNutrition.completeness * 100)}% coverage`}
            </span>
          ) : null}
          {recipe.pantryAvailability ? (
            <span className="recipe-card-meta">
              <PantryAvailabilityPill state={recipe.pantryAvailability} />
              {recipe.pantryInsight ? ` · ${recipe.pantryInsight}` : ''}
            </span>
          ) : null}
        </span>
      </Link>
      <RecipeReactionButtons
        key={recipe.personalRating ?? 'no-reaction'}
        recipeId={recipe.id}
        initialScore={recipe.personalRating}
      />
      {compact ? null : <RecipeCollectionButton recipeId={recipe.id} recipeTitle={recipe.title} />}
    </article>
  );
}
