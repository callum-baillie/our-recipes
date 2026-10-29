'use client';

import { ToastMessage } from './toast-message';

import { AlertTriangle, RotateCcw } from 'lucide-react';
import { useRef, useState } from 'react';

import { LoadingIndicator } from '@/components/skeleton';
import { SettingsPane, SettingsRow, SettingsField } from '@/components/settings-primitives';
import { useToast } from '@/components/toast-provider';

const CONFIRMATION = 'FRESH INSTALL';

export function FreshInstallPanel() {
  const dialogRef = useRef<HTMLDialogElement>(null);
  const { showToast } = useToast();
  const [confirmation, setConfirmation] = useState('');
  const [pending, setPending] = useState(false);
  const [error, setError] = useState('');
  const lock = useRef(false);

  async function reset() {
    if (lock.current || confirmation !== CONFIRMATION) return;
    lock.current = true;
    setPending(true);
    setError('');
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
      setError(
        error instanceof TypeError
          ? 'Reset outcome could not be confirmed. Reload the installation before trying again.'
          : error instanceof Error
            ? error.message
            : 'The reset outcome is uncertain. Refresh before trying again.',
      );
      lock.current = false;
      showToast(
        error instanceof Error ? error.message : 'The database could not be reset safely.',
        'error',
      );
      setPending(false);
    }
  }

  return (
    <SettingsPane
      tone="danger"
      eyebrow="DANGER ZONE"
      id="danger"
      title="Erase app data and start over"
      description="Irreversible installation-level actions are kept separate from everyday preferences."
    >
      <SettingsRow
        title="Erase app data and start over"
        description="Creates one final local safety backup, then removes recipes, profiles, plans, lists, Pantry stock, and Nutrition data. Existing backup archives and uploaded media remain."
      >
        <button
          className="danger-button"
          type="button"
          onClick={() => {
            setConfirmation('');
            setError('');
            dialogRef.current?.showModal();
          }}
        >
          <RotateCcw size={17} /> Erase app data
        </button>
      </SettingsRow>
      <dialog
        className="confirmation-dialog settings-dialog"
        ref={dialogRef}
        onCancel={(event) => {
          if (lock.current) event.preventDefault();
        }}
        aria-labelledby="fresh-install-title"
      >
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
            <h2 id="fresh-install-title">Erase app data and start over</h2>
            <p>
              This removes all your recipes, profiles, meal plans, lists, Pantry stock, and
              Nutrition data, then returns you to the first page to set up the app again. A final
              local safety backup is kept.
            </p>
            <p>
              Type <strong>{CONFIRMATION}</strong> to confirm.
            </p>
          </div>
          <SettingsField title="Confirmation" description={`Enter ${CONFIRMATION} to continue.`}>
            <input
              disabled={pending}
              autoFocus
              autoComplete="off"
              value={confirmation}
              onChange={(event) => setConfirmation(event.target.value)}
              placeholder={CONFIRMATION}
            />
          </SettingsField>
          {error && <ToastMessage message={error} tone="error" />}
          {pending && (
            <p role="status">
              Erasing app data… Closing this page does not cancel the server operation.
            </p>
          )}
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
              {pending ? <LoadingIndicator label="Resetting database" /> : null}
              Erase app data and start fresh
            </button>
          </div>
        </form>
      </dialog>
    </SettingsPane>
  );
}
