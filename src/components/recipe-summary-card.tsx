import { ChefHat, Clock3 } from 'lucide-react';
import Image from 'next/image';
import Link from 'next/link';

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
}: {
  recipe: RecipeSummaryCardData;
  compact?: boolean;
}) {
  const totalMinutes = recipe.prepMinutes + recipe.cookMinutes + recipe.restMinutes;
  const labels = recipe.tags.length ? recipe.tags : recipe.category ? [recipe.category] : [];

  return (
    <Link
      className={`recipe-summary-card${compact ? ' compact' : ''}`}
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
      </span>
    </Link>
  );
}
