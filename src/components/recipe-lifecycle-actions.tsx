'use client';

import { ToastNotice } from './toast-provider';

import { ToastMessage } from './toast-message';

import { Archive, Copy, Star, RotateCcw, Trash2 } from 'lucide-react';
import { useRouter } from 'next/navigation';
import { useState } from 'react';

import { ButtonSpinner } from '@/components/skeleton';

type RecipeLifecycleActionsProps = {
  recipeId: string;
  status: 'active' | 'archived' | 'trash';
  currentRevision: number;
  personalPreference: { rating: number | null; note: string } | null;
};

export function RecipeLifecycleActions({
  recipeId,
  status,
  currentRevision,
  personalPreference,
}: RecipeLifecycleActionsProps) {
  const router = useRouter();
  const [pendingAction, setPendingAction] = useState<
    'duplicate' | 'archive' | 'restore' | 'trash' | 'preference' | null
  >(null);
  const [error, setError] = useState<string | null>(null);
  const [hoverRating, setHoverRating] = useState<number | null>(null);
  const [rating, setRating] = useState<number | null>(personalPreference?.rating ?? null);
  const [note, setNote] = useState(personalPreference?.note ?? '');
  const [preferenceSaved, setPreferenceSaved] = useState(false);
  const [ratingDirty, setRatingDirty] = useState(false);
  const serverRating = personalPreference?.rating ?? null;
  const [previousServerRating, setPreviousServerRating] = useState(serverRating);
  if (previousServerRating !== serverRating) {
    setPreviousServerRating(serverRating);
    if (!ratingDirty) setRating(serverRating);
  }

  async function duplicate() {
    setPendingAction('duplicate');
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
      setPendingAction(null);
    }
  }

  async function updateStatus(nextStatus: 'active' | 'archived' | 'trash') {
    setPendingAction(
      nextStatus === 'archived' ? 'archive' : nextStatus === 'trash' ? 'trash' : 'restore',
    );
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
      setPendingAction(null);
    }
  }

  async function savePersonalPreference(nextRating = rating) {
    setPendingAction('preference');
    setError(null);
    setPreferenceSaved(false);
    try {
      const response = await fetch(`/api/v1/recipes/${recipeId}/preference`, {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ rating: nextRating, note }),
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
      setRatingDirty(false);
      setNote(body.preference.note);
      setPreferenceSaved(true);
      router.refresh();
    } catch {
      setError('Your rating or note could not be saved. Please try again.');
    } finally {
      setPendingAction(null);
    }
  }

  return (
    <div className="recipe-lifecycle-actions">
      <div className="recipe-maintenance-actions" aria-label="Recipe maintenance actions">
        <button
          className="text-button"
          type="button"
          disabled={pendingAction !== null}
          aria-busy={pendingAction === 'duplicate'}
          onClick={duplicate}
        >
          {pendingAction === 'duplicate' ? <ButtonSpinner /> : <Copy size={15} />}{' '}
          {pendingAction === 'duplicate' ? 'Duplicating…' : 'Duplicate'}
        </button>
        {status === 'active' ? (
          <button
            className="text-button"
            type="button"
            disabled={pendingAction !== null}
            aria-busy={pendingAction === 'archive'}
            onClick={() => updateStatus('archived')}
          >
            {pendingAction === 'archive' ? <ButtonSpinner /> : <Archive size={15} />}{' '}
            {pendingAction === 'archive' ? 'Archiving…' : 'Archive'}
          </button>
        ) : (
          <button
            className="text-button"
            type="button"
            disabled={pendingAction !== null}
            aria-busy={pendingAction === 'restore'}
            onClick={() => updateStatus('active')}
          >
            {pendingAction === 'restore' ? <ButtonSpinner /> : <RotateCcw size={15} />}{' '}
            {pendingAction === 'restore' ? 'Restoring…' : 'Restore to library'}
          </button>
        )}
        {status !== 'trash' && (
          <button
            className="text-button danger-text-button"
            type="button"
            disabled={pendingAction !== null}
            aria-busy={pendingAction === 'trash'}
            onClick={() => updateStatus('trash')}
          >
            {pendingAction === 'trash' ? <ButtonSpinner /> : <Trash2 size={15} />}{' '}
            {pendingAction === 'trash' ? 'Moving…' : 'Move to trash'}
          </button>
        )}
      </div>
      {error && <ToastMessage message={error} tone="error" />}
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
              Your rating and Like/Staple reflect the same personal preference. Save the rating and
              private note together; neither is exported or versioned.
            </p>
          </div>
          <div className="recipe-star-rating" role="group" aria-label="Your rating">
            {[1, 2, 3, 4, 5].map((value) => (
              <button
                key={value}
                type="button"
                disabled={pendingAction !== null}
                aria-label={`Rate ${value} out of 5 stars`}
                aria-pressed={rating === value}
                onMouseEnter={() => setHoverRating(value)}
                onMouseLeave={() => setHoverRating(null)}
                onFocus={() => setHoverRating(value)}
                onBlur={() => setHoverRating(null)}
                onClick={() => {
                  setRating(value);
                  setRatingDirty(true);
                  setPreferenceSaved(false);
                }}
              >
                <Star
                  size={25}
                  fill={value <= (hoverRating ?? rating ?? 0) ? 'currentColor' : 'none'}
                />
              </button>
            ))}
          </div>
          <label>
            <span>Personal note</span>
            <textarea
              aria-label="Personal note"
              rows={3}
              maxLength={2000}
              value={note}
              disabled={pendingAction !== null}
              onChange={(event) => setNote(event.target.value)}
              placeholder="What would you change next time?"
            />
          </label>
          <div>
            <button
              className="text-button"
              type="submit"
              disabled={pendingAction !== null}
              aria-busy={pendingAction === 'preference'}
            >
              {pendingAction === 'preference' ? <ButtonSpinner /> : null}
              {pendingAction === 'preference' ? 'Saving…' : 'Save rating and note'}
            </button>
            {preferenceSaved && <ToastNotice>Saved for your profile.</ToastNotice>}
          </div>
        </form>
      )}
    </div>
  );
}
