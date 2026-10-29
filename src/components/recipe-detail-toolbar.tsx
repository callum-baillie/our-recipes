'use client';

import { ToastMessage } from './toast-message';

import Link from 'next/link';
import { ChefHat, Edit3, Heart, Printer, Sparkles } from 'lucide-react';
import { useRouter } from 'next/navigation';
import { useRef, useState } from 'react';
import type { RecipePayload } from '@/lib/domain/recipe';
import { LoadingIndicator } from './skeleton';
import { RecipeEnhancementDialog } from './recipe-enhancement-dialog';

export function RecipeDetailToolbar({
  recipeId,
  recipe,
  revision,
  initialFavorite,
}: {
  recipeId: string;
  recipe: RecipePayload;
  revision: number;
  initialFavorite: boolean | null;
}) {
  const router = useRouter();
  const [enhancing, setEnhancing] = useState(false);
  const [favorite, setFavorite] = useState(initialFavorite);
  const [pending, setPending] = useState(false);
  const [error, setError] = useState('');
  const busy = useRef(false);
  const [previousFavorite, setPreviousFavorite] = useState(initialFavorite);
  if (previousFavorite !== initialFavorite) {
    setPreviousFavorite(initialFavorite);
    if (!pending) setFavorite(initialFavorite);
  }

  async function toggleFavorite() {
    if (busy.current || favorite === null) return;
    busy.current = true;
    setPending(true);
    setError('');
    try {
      const response = await fetch(`/api/v1/recipes/${recipeId}/favorite`, {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ favorite: !favorite }),
      });
      const body = await response.json().catch(() => null);
      if (!response.ok || typeof body?.favorite !== 'boolean')
        throw new Error(body?.error?.message ?? 'Your favorite could not be saved. Try again.');
      setFavorite(body.favorite);
      router.refresh();
    } catch (error) {
      setError(error instanceof Error ? error.message : 'Check your connection and try again.');
    } finally {
      busy.current = false;
      setPending(false);
    }
  }

  return (
    <>
      <div
        className="recipe-detail-toolbar"
        role="toolbar"
        aria-label="Recipe actions"
        onKeyDown={(event) => {
          if (!['ArrowLeft', 'ArrowRight', 'Home', 'End'].includes(event.key)) return;
          const controls = Array.from(
            event.currentTarget.querySelectorAll<HTMLElement>('a[href], button:not(:disabled)'),
          );
          const index = controls.indexOf(document.activeElement as HTMLElement);
          if (index < 0) return;
          event.preventDefault();
          const next =
            event.key === 'Home'
              ? 0
              : event.key === 'End'
                ? controls.length - 1
                : (index + (event.key === 'ArrowRight' ? 1 : -1) + controls.length) %
                  controls.length;
          controls[next]?.focus();
        }}
      >
        <Link
          className="recipe-toolbar-primary"
          href={`/recipes/${recipeId}/cook`}
          aria-label="Cook this recipe"
          title="Cook this recipe"
        >
          <ChefHat size={20} aria-hidden="true" />
          <span className="recipe-toolbar-label">Cook</span>
        </Link>
        <button
          className="recipe-toolbar-button"
          type="button"
          aria-label={favorite ? 'Clear positive reaction' : 'Like this recipe'}
          title={
            favorite === null
              ? 'Choose a profile to save favorites'
              : favorite
                ? 'Clear positive reaction'
                : 'Like this recipe'
          }
          aria-pressed={favorite ?? false}
          aria-busy={pending}
          disabled={pending || favorite === null}
          onClick={() => void toggleFavorite()}
        >
          {pending ? (
            <LoadingIndicator label="Saving favorite" />
          ) : (
            <Heart size={20} fill={favorite ? 'currentColor' : 'none'} aria-hidden="true" />
          )}
          <span className="recipe-toolbar-label">{favorite ? 'Liked' : 'Like'}</span>
        </button>
        <Link
          className="recipe-toolbar-button"
          href={`/recipes/${recipeId}/edit`}
          aria-label="Edit recipe"
          title="Edit recipe"
        >
          <Edit3 size={20} aria-hidden="true" />
          <span className="recipe-toolbar-label">Edit</span>
        </Link>
        <a
          className="recipe-toolbar-button"
          href={`/print?kind=recipes&recipes=${encodeURIComponent(recipeId)}`}
          aria-label="Export / print"
          title="Export / print"
        >
          <Printer size={20} aria-hidden="true" />
          <span className="recipe-toolbar-label">Export / print</span>
        </a>
        <button
          className="recipe-toolbar-button"
          type="button"
          aria-label="AI enhance"
          title="AI enhance"
          onClick={() => setEnhancing(true)}
        >
          <Sparkles size={20} aria-hidden="true" />
          <span className="recipe-toolbar-label">AI enhance</span>
        </button>
      </div>
      {error && <ToastMessage message={error} tone="error" />}
      <RecipeEnhancementDialog
        open={enhancing}
        onClose={() => setEnhancing(false)}
        recipeId={recipeId}
        recipe={recipe}
        revision={revision}
      />
    </>
  );
}
