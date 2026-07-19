'use client';

import { Archive, Copy, Heart, RotateCcw, Trash2 } from 'lucide-react';
import { useRouter } from 'next/navigation';
import { useState } from 'react';

type RecipeLifecycleActionsProps = {
  recipeId: string;
  status: 'active' | 'archived' | 'trash';
  currentRevision: number;
  personalPreference: { rating: number | null; note: string } | null;
  initialFavorite: boolean | null;
};

export function RecipeLifecycleActions({
  recipeId,
  status,
  currentRevision,
  personalPreference,
  initialFavorite,
}: RecipeLifecycleActionsProps) {
  const router = useRouter();
  const [pending, setPending] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [rating, setRating] = useState<number | null>(personalPreference?.rating ?? null);
  const [note, setNote] = useState(personalPreference?.note ?? '');
  const [preferenceSaved, setPreferenceSaved] = useState(false);
  const [favorite, setFavorite] = useState(initialFavorite);

  async function duplicate() {
    setPending(true);
    setError(null);
    try {
      const response = await fetch(`/api/v1/recipes/${recipeId}/duplicate`, { method: 'POST' });
      const body = (await response.json().catch(() => null)) as {
        recipe?: { id?: string };
        error?: { message?: string };
      } | null;
      if (!response.ok || !body?.recipe?.id) {
        setError(body?.error?.message ?? 'We could not duplicate this recipe.');
        return;
      }
      router.push(`/recipes/${body.recipe.id}/edit`);
      router.refresh();
    } finally {
      setPending(false);
    }
  }

  async function updateStatus(nextStatus: 'active' | 'archived' | 'trash') {
    setPending(true);
    setError(null);
    try {
      const response = await fetch(`/api/v1/recipes/${recipeId}/status`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ status: nextStatus, expectedRevision: currentRevision }),
      });
      const body = (await response.json().catch(() => null)) as {
        error?: { message?: string };
      } | null;
      if (!response.ok) {
        setError(body?.error?.message ?? 'We could not update this recipe.');
        return;
      }
      router.refresh();
    } finally {
      setPending(false);
    }
  }

  async function savePersonalPreference() {
    setPending(true);
    setError(null);
    setPreferenceSaved(false);
    try {
      const response = await fetch(`/api/v1/recipes/${recipeId}/preference`, {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ rating, note }),
      });
      const body = (await response.json().catch(() => null)) as {
        preference?: { rating: number | null; note: string };
        error?: { message?: string };
      } | null;
      if (!response.ok || !body?.preference) {
        setError(body?.error?.message ?? 'We could not save your personal preference.');
        return;
      }
      setRating(body.preference.rating);
      setNote(body.preference.note);
      setPreferenceSaved(true);
      router.refresh();
    } finally {
      setPending(false);
    }
  }

  async function toggleFavorite() {
    if (favorite === null) return;
    const nextFavorite = !favorite;
    setPending(true);
    setError(null);
    try {
      const response = await fetch(`/api/v1/recipes/${recipeId}/favorite`, {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ favorite: nextFavorite }),
      });
      const body = (await response.json().catch(() => null)) as {
        favorite?: boolean;
        error?: { message?: string };
      } | null;
      if (!response.ok || typeof body?.favorite !== 'boolean') {
        setError(body?.error?.message ?? 'We could not update your favorite.');
        return;
      }
      setFavorite(body.favorite);
      router.refresh();
    } finally {
      setPending(false);
    }
  }

  return (
    <div className="recipe-lifecycle-actions">
      <div className="recipe-maintenance-actions" aria-label="Recipe maintenance actions">
        <button className="text-button" type="button" disabled={pending} onClick={duplicate}>
          <Copy size={15} /> Duplicate
        </button>
        {favorite !== null && (
          <button
            className="text-button"
            type="button"
            disabled={pending}
            onClick={toggleFavorite}
            aria-pressed={favorite}
          >
            <Heart size={15} fill={favorite ? 'currentColor' : 'none'} />{' '}
            {favorite ? 'Favorite' : 'Save favorite'}
          </button>
        )}
        {status === 'active' ? (
          <button
            className="text-button"
            type="button"
            disabled={pending}
            onClick={() => updateStatus('archived')}
          >
            <Archive size={15} /> Archive
          </button>
        ) : (
          <button
            className="text-button"
            type="button"
            disabled={pending}
            onClick={() => updateStatus('active')}
          >
            <RotateCcw size={15} /> Restore to library
          </button>
        )}
        {status !== 'trash' && (
          <button
            className="text-button danger-text-button"
            type="button"
            disabled={pending}
            onClick={() => updateStatus('trash')}
          >
            <Trash2 size={15} /> Move to trash
          </button>
        )}
      </div>
      {error && <span role="alert">{error}</span>}
      {personalPreference && (
        <form
          className="recipe-personal-preference"
          onSubmit={(event) => {
            event.preventDefault();
            void savePersonalPreference();
          }}
        >
          <div>
            <strong>Your kitchen notes</strong>
            <p>
              Only this profile can see these notes and rating. They are not exported or versioned.
            </p>
          </div>
          <label>
            <span>Your rating</span>
            <select
              aria-label="Your rating"
              value={rating ?? ''}
              disabled={pending}
              onChange={(event) =>
                setRating(event.target.value ? Number(event.target.value) : null)
              }
            >
              <option value="">No rating</option>
              <option value="1">1 — would skip</option>
              <option value="2">2 — needs work</option>
              <option value="3">3 — good</option>
              <option value="4">4 — make again</option>
              <option value="5">5 — household favorite</option>
            </select>
          </label>
          <label>
            <span>Personal note</span>
            <textarea
              aria-label="Personal note"
              rows={3}
              maxLength={2000}
              value={note}
              disabled={pending}
              onChange={(event) => setNote(event.target.value)}
              placeholder="What would you change next time?"
            />
          </label>
          <div>
            <button className="text-button" type="submit" disabled={pending}>
              Save personal preference
            </button>
            {preferenceSaved && <span role="status">Saved for your profile.</span>}
          </div>
        </form>
      )}
    </div>
  );
}
