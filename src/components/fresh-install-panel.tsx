'use client';

import { AlertTriangle, RotateCcw } from 'lucide-react';
import { useRef, useState } from 'react';

import { InlineSkeleton } from '@/components/skeleton';
import { useToast } from '@/components/toast-provider';

const CONFIRMATION = 'FRESH INSTALL';

export function FreshInstallPanel() {
  const dialogRef = useRef<HTMLDialogElement>(null);
  const { showToast } = useToast();
  const [confirmation, setConfirmation] = useState('');
  const [pending, setPending] = useState(false);

  async function reset() {
    setPending(true);
    try {
      const response = await fetch('/api/v1/settings/fresh-install', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ confirmation }),
      });
      const body = (await response.json().catch(() => null)) as {
        error?: { message?: string };
      } | null;
      if (!response.ok) {
        throw new Error(body?.error?.message ?? 'The database could not be reset safely.');
      }
      dialogRef.current?.close();
      window.location.replace('/');
    } catch (error) {
      showToast(
        error instanceof Error ? error.message : 'The database could not be reset safely.',
        'error',
      );
      setPending(false);
    }
  }

  return (
    <section className="settings-card danger-zone" aria-labelledby="danger-zone-title">
      <div>
        <p className="eyebrow">DANGER ZONE</p>
        <h2 id="danger-zone-title">Need a fresh start?</h2>
        <p>
          Fresh install creates one final local safety backup, then removes all recipes, profiles,
          meal plans, lists, Pantry stock, and Nutrition data from the active app. Existing backup
          archives and uploaded media files stay on this device.
        </p>
      </div>
      <button
        className="danger-button"
        type="button"
        onClick={() => {
          setConfirmation('');
          dialogRef.current?.showModal();
        }}
      >
        <RotateCcw size={17} /> Fresh install
      </button>
      <dialog className="confirmation-dialog" ref={dialogRef} aria-labelledby="fresh-install-title">
        <form
          method="dialog"
          onSubmit={(event) => {
            event.preventDefault();
            if (confirmation === CONFIRMATION && !pending) void reset();
          }}
        >
          <AlertTriangle size={28} aria-hidden="true" />
          <div>
            <p className="eyebrow">FRESH INSTALL</p>
            <h2 id="fresh-install-title">Need a fresh start?</h2>
            <p>
              This removes all your recipes, profiles, meal plans, lists, Pantry stock, and
              Nutrition data, then returns you to the first page to set up the app again. A final
              local safety backup is kept.
            </p>
            <p>
              Type <strong>{CONFIRMATION}</strong> to confirm.
            </p>
          </div>
          <label>
            <span>Confirmation</span>
            <input
              autoFocus
              autoComplete="off"
              value={confirmation}
              onChange={(event) => setConfirmation(event.target.value)}
              placeholder={CONFIRMATION}
            />
          </label>
          <div className="dialog-actions">
            <button
              className="text-button"
              type="button"
              disabled={pending}
              onClick={() => dialogRef.current?.close()}
            >
              Cancel
            </button>
            <button
              className="danger-button"
              type="submit"
              disabled={confirmation !== CONFIRMATION || pending}
              aria-busy={pending}
            >
              {pending ? <InlineSkeleton label="Resetting database" width="1rem" /> : null}
              Erase app data and start fresh
            </button>
          </div>
        </form>
      </dialog>
    </section>
  );
}
