'use client';

import { History, RotateCcw } from 'lucide-react';
import { useRouter } from 'next/navigation';
import { useState } from 'react';

type Revision = {
  revision: number;
  editedByName: string;
  createdAt: string;
};

type RecipeRevisionHistoryProps = {
  recipeId: string;
  currentRevision: number;
  revisions: Revision[];
};

function dateLabel(value: string): string {
  return new Intl.DateTimeFormat(undefined, { dateStyle: 'medium', timeStyle: 'short' }).format(
    new Date(value),
  );
}

export function RecipeRevisionHistory({
  recipeId,
  currentRevision,
  revisions,
}: RecipeRevisionHistoryProps) {
  const router = useRouter();
  const [selectedRevision, setSelectedRevision] = useState<number | null>(null);
  const [pending, setPending] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function restore() {
    if (selectedRevision === null) return;
    setPending(true);
    setError(null);
    try {
      const response = await fetch(
        `/api/v1/recipes/${recipeId}/revisions/${selectedRevision}/restore`,
        {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ expectedRevision: currentRevision }),
        },
      );
      const body = (await response.json().catch(() => null)) as {
        recipe?: { currentRevision?: number };
        error?: { message?: string };
      } | null;
      if (!response.ok || !body?.recipe?.currentRevision) {
        setError(body?.error?.message ?? 'We could not restore that saved version.');
        return;
      }
      router.refresh();
    } finally {
      setPending(false);
    }
  }

  return (
    <details className="recipe-revision-history">
      <summary>
        <History size={16} aria-hidden="true" /> Revision history ({revisions.length} saved{' '}
        {revisions.length === 1 ? 'version' : 'versions'})
      </summary>
      <p>
        Restoring a saved version creates a new shared revision. Personal ratings and notes stay
        private.
      </p>
      <ol>
        {revisions.map((revision) => (
          <li key={revision.revision}>
            <div>
              <strong>Revision {revision.revision}</strong>
              <span>
                {revision.editedByName} · {dateLabel(revision.createdAt)}
              </span>
            </div>
            {revision.revision === currentRevision ? (
              <span className="current-revision-label">Current version</span>
            ) : (
              <button
                className="text-button"
                type="button"
                disabled={pending}
                onClick={() => {
                  setSelectedRevision(revision.revision);
                  setError(null);
                }}
              >
                <RotateCcw size={15} /> Restore revision {revision.revision}
              </button>
            )}
          </li>
        ))}
      </ol>
      {selectedRevision !== null && (
        <div className="revision-restore-confirmation">
          <p role="status">
            Restore revision {selectedRevision}? It will become a new shared revision after the
            current one.
          </p>
          <div>
            <button className="text-button" type="button" disabled={pending} onClick={restore}>
              Confirm restore
            </button>
            <button
              className="text-button"
              type="button"
              disabled={pending}
              onClick={() => setSelectedRevision(null)}
            >
              Cancel
            </button>
          </div>
        </div>
      )}
      {error && <p role="alert">{error}</p>}
    </details>
  );
}
