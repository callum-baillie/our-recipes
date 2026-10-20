'use client';
import type { ReactNode } from 'react';

/** A failed optimistic save keeps its draft until current values are explicitly reviewed. */
export function SettingsConflictReview({
  pending,
  loaded,
  onLoad,
  onKeepDraft,
  onUseSaved,
  children,
}: {
  pending: boolean;
  loaded: boolean;
  onLoad: () => void;
  onKeepDraft: () => void;
  onUseSaved: () => void;
  children?: ReactNode;
}) {
  return (
    <section className="settings-local-status" aria-label="Review changed settings">
      <p role="status">
        These settings changed elsewhere. Your draft is retained. Load the saved values before
        choosing what to keep.
      </p>
      <button type="button" className="secondary-button" disabled={pending} onClick={onLoad}>
        {pending ? 'Loading current settings…' : 'Load current settings'}
      </button>
      {loaded && (
        <>
          {children}
          <p>
            Keeping your draft updates its version for another explicit save. It does not save or
            generate anything.
          </p>
          <div className="button-row">
            <button
              type="button"
              className="secondary-button"
              disabled={pending}
              onClick={onKeepDraft}
            >
              Keep my draft against this version
            </button>
            <button type="button" className="text-button" disabled={pending} onClick={onUseSaved}>
              Use saved settings and discard this draft
            </button>
          </div>
        </>
      )}
    </section>
  );
}
