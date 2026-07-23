'use client';

import { BookmarkCheck, Heart, ThumbsDown } from 'lucide-react';
import { useRouter } from 'next/navigation';
import { useState } from 'react';

import { useToast } from '@/components/toast-provider';
import { RECIPE_REACTION_SCORES, type RecipeReactionScore } from '@/lib/domain/recipe-reaction';

const reactions = [
  {
    score: RECIPE_REACTION_SCORES.dislike,
    label: 'Dislike this recipe',
    confirmation: 'Marked as a recipe to skip.',
    Icon: ThumbsDown,
  },
  {
    score: RECIPE_REACTION_SCORES.like,
    label: 'Like this recipe',
    confirmation: 'Liked this recipe.',
    Icon: Heart,
  },
  {
    score: RECIPE_REACTION_SCORES.staple,
    label: 'Mark this recipe as a staple',
    confirmation: 'Marked this recipe as a staple.',
    Icon: BookmarkCheck,
  },
] as const;

export function RecipeReactionButtons({
  recipeId,
  initialScore,
}: {
  recipeId: string;
  initialScore: number | null;
}) {
  const router = useRouter();
  const { showToast } = useToast();
  const [score, setScore] = useState<number | null>(initialScore);
  const [pending, setPending] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function chooseReaction(nextReaction: RecipeReactionScore) {
    const previousScore = score;
    const nextScore = score === nextReaction ? null : nextReaction;
    setScore(nextScore);
    setPending(true);
    setError(null);
    try {
      const response = await fetch(`/api/v1/recipes/${recipeId}/preference`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ score: nextScore }),
      });
      const body = (await response.json().catch(() => null)) as {
        preference?: { rating: number | null };
        error?: { message?: string };
      } | null;
      if (!response.ok || !body?.preference) {
        const message = body?.error?.message ?? 'We could not save your reaction.';
        setScore(previousScore);
        setError(message);
        showToast(message, 'error');
        return;
      }
      setScore(body.preference.rating);
      showToast(
        nextScore === null
          ? 'Recipe reaction cleared.'
          : reactions.find((reaction) => reaction.score === nextScore)!.confirmation,
        'success',
      );
      router.refresh();
    } catch {
      const message = 'We could not reach the recipe server. Try again.';
      setScore(previousScore);
      setError(message);
      showToast(message, 'error');
    } finally {
      setPending(false);
    }
  }

  return (
    <div className="recipe-reaction-buttons" role="group" aria-label="Your recipe reaction">
      {reactions.map(({ score: reactionScore, label, Icon }) => {
        const selected = score === reactionScore;
        return (
          <button
            type="button"
            key={reactionScore}
            aria-label={`${label} (score ${reactionScore})`}
            aria-pressed={selected}
            disabled={pending}
            onClick={() => void chooseReaction(reactionScore)}
          >
            <Icon size={17} fill={selected ? 'currentColor' : 'none'} aria-hidden="true" />
          </button>
        );
      })}
      {error ? (
        <span className="sr-only" role="alert">
          {error}
        </span>
      ) : null}
    </div>
  );
}
