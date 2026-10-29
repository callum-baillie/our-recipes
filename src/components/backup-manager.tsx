'use client';

import { ToastNotice } from './toast-provider';

import { ToastMessage } from './toast-message';

import { ArchiveRestore, Download, ShieldCheck } from 'lucide-react';
import { useRef, useState } from 'react';
import { AppDialog } from './app-dialog';

import { useToast } from '@/components/toast-provider';
import { LoadingIndicator } from '@/components/skeleton';
import {
  SettingsPane,
  SettingsRow,
  SettingsField,
  SettingsSubsection,
  SettingsItem,
  SettingsEmpty,
  SettingsActionBar,
} from './settings-primitives';

type BackupSummary = { id: string; createdAt: string; bytes: number };
type BackupManifest = {
  applicationVersion: string;
  schemaVersion: string;
  createdAt: string;
  reason: string;
  files: Array<{ path: string; bytes: number }>;
};

type BackupPreview = BackupSummary & { manifest: BackupManifest };

type BackupStorage = {
  directory: string;
  location: 'app-data' | 'dedicated';
  intervalHours: number;
  retentionDays: number;
};

type BackupManagerProps = { initialBackups: BackupSummary[]; storage: BackupStorage };

function formatBytes(bytes: number): string {
  if (bytes < 1024 * 1024) return `${Math.max(1, Math.round(bytes / 1024))} KB`;
  return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
}

function displayDate(value: string): string {
  return new Intl.DateTimeFormat(undefined, { dateStyle: 'medium', timeStyle: 'short' }).format(
    new Date(value),
  );
}

export function BackupManager({ initialBackups, storage }: BackupManagerProps) {
  const { showToast } = useToast();
  const [backups, setBackups] = useState(initialBackups);
  const [preview, setPreview] = useState<BackupPreview | null>(null);
  const [confirmation, setConfirmation] = useState('');
  const [pending, setPending] = useState<'create' | 'preview' | 'restore' | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [limit, setLimit] = useState(5);
  const [creationStatus, setCreationStatus] = useState('');
  const [creationError, setCreationError] = useState('');
  const [historyError, setHistoryError] = useState('');
  const lock = useRef(false);
  const inspection = useRef(0);
  const [reviewOpen, setReviewOpen] = useState(false);
  const [pendingBackupId, setPendingBackupId] = useState<string | null>(null);

  async function refreshBackups() {
    const response = await fetch('/api/v1/backups');
    const body = (await response.json().catch(() => null)) as { backups?: BackupSummary[] } | null;
    if (!response.ok || !body?.backups)
      throw new Error(
        'Backup history could not be refreshed. Your existing archives are unchanged.',
      );
    setBackups(body.backups);
    setHistoryError('');
  }

  async function create() {
    if (lock.current) return;
    lock.current = true;
    setCreationStatus('');
    setCreationError('');
    setPending('create');
    setError(null);
    try {
      const response = await fetch('/api/v1/backups', { method: 'POST' });
      const body = (await response.json().catch(() => null)) as {
        error?: { message?: string };
      } | null;
      if (!response.ok) {
        const message = body?.error?.message ?? 'We could not create a backup yet.';
        setCreationError(message);
        showToast(message, 'error');
        return;
      }
      setCreationStatus('Backup created. Review restore to validate this archive before use.');
      showToast('Backup created.', 'success');
      try {
        await refreshBackups();
      } catch (cause) {
        setHistoryError(
          cause instanceof Error ? cause.message : 'Refresh backup history to see the new archive.',
        );
      }
    } catch (cause) {
      const message =
        cause instanceof TypeError
          ? 'The creation response was not received. Refresh backup history before creating another archive.'
          : cause instanceof Error
            ? cause.message
            : 'Refresh history before retrying.';
      setCreationError(message);
      showToast(message, 'error');
    } finally {
      lock.current = false;
      setPending(null);
    }
  }

  async function inspect(id: string) {
    if (lock.current) return;
    lock.current = true;
    const token = ++inspection.current;
    setPreview(null);
    setConfirmation('');
    setReviewOpen(true);
    setPendingBackupId(id);
    setPending('preview');
    setError(null);
    try {
      const response = await fetch(`/api/v1/backups/${id}`);
      const body = (await response.json().catch(() => null)) as {
        backup?: BackupPreview;
        error?: { message?: string };
      } | null;
      if (token !== inspection.current) return;
      if (!response.ok || !body?.backup) {
        const message = body?.error?.message ?? 'We could not validate that backup.';
        setError(message);
        showToast(message, 'error');
        return;
      }
      if (token !== inspection.current) return;
      setPreview(body.backup);
      setConfirmation('');
      showToast('Backup validated. Review it before restoring.', 'success');
    } catch (cause) {
      if (token !== inspection.current) return;
      const message = cause instanceof Error ? cause.message : 'Check your connection and retry.';
      setError(message);
      showToast(message, 'error');
    } finally {
      lock.current = false;
      setPending(null);
    }
  }

  async function restore() {
    if (
      lock.current ||
      !reviewOpen ||
      !preview ||
      preview.id !== pendingBackupId ||
      confirmation !== 'RESTORE'
    )
      return;
    lock.current = true;
    setPending('restore');
    setError(null);
    try {
      const response = await fetch(`/api/v1/backups/${preview.id}/restore`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ confirmation }),
      });
      const body = (await response.json().catch(() => null)) as {
        error?: { message?: string };
      } | null;
      if (!response.ok) {
        const message = body?.error?.message ?? 'The backup could not be restored safely.';
        setError(message);
        showToast(message, 'error');
        return;
      }
      // Restore replaces sessions and household data; discard every client-side cache.
      // eslint-disable-next-line @next/next/no-location-assign-relative-destination
      window.location.assign('/');
    } catch {
      const message =
        'Restore outcome could not be confirmed. Reload the installation before attempting another restore.';
      setError(message);
      showToast(message, 'error');
    } finally {
      lock.current = false;
      setPending(null);
    }
  }

  function closeReview() {
    if (pending === 'restore') return;
    inspection.current++;
    setReviewOpen(false);
    setPreview(null);
    setConfirmation('');
    setError(null);
  }

  return (
    <SettingsPane
      id="backups"
      title="Backups & recovery"
      description="Create and restore local copies of your recipes, media, and household data. Server credentials are excluded."
    >
      <SettingsRow
        title="Create a backup"
        description="Create a snapshot with a checksum manifest. Full archive validation happens during Review restore."
      >
        <button
          className="secondary-button"
          type="button"
          onClick={() => void create()}
          disabled={pending !== null}
        >
          {pending === 'create' ? (
            <LoadingIndicator label="Creating backup" />
          ) : (
            <ArchiveRestore size={17} />
          )}
          {pending === 'create' ? 'Creating…' : 'Create backup'}
        </button>
        {creationStatus && <ToastNotice>{creationStatus}</ToastNotice>}
        {creationError && <ToastNotice tone="error">{creationError}</ToastNotice>}
      </SettingsRow>
      <SettingsRow
        title="Configured backup policy"
        description="The interval and retention period are configured on the server."
      >
        <output>
          Every {storage.intervalHours} {storage.intervalHours === 1 ? 'hour' : 'hours'} · Keep{' '}
          {storage.retentionDays} days
        </output>
      </SettingsRow>
      <SettingsRow
        title="Backup storage"
        description={
          storage.location === 'dedicated'
            ? 'A dedicated directory is configured for backup archives.'
            : 'Stored with app data. Set BACKUP_DIR on the server to use a separate mounted directory.'
        }
      >
        <output>
          <code>{storage.directory}</code>
        </output>
      </SettingsRow>
      <SettingsSubsection
        title="Saved backups"
        description="Download an archive or validate it before restoring. Restoring first creates a fresh safety backup."
      >
        {!backups.length ? (
          <SettingsEmpty>No backups yet. Create your first backup above.</SettingsEmpty>
        ) : (
          backups.slice(0, limit).map((backup) => (
            <SettingsItem
              key={backup.id}
              title={displayDate(backup.createdAt)}
              description={`${formatBytes(backup.bytes)} · ${Intl.DateTimeFormat().resolvedOptions().timeZone}`}
              actions={
                <>
                  <a className="text-button" href={`/api/v1/backups/${backup.id}/download`}>
                    <Download size={16} />
                    Download
                  </a>
                  <button
                    className="text-button"
                    type="button"
                    disabled={pending !== null}
                    onClick={() => void inspect(backup.id)}
                  >
                    <ShieldCheck size={16} />
                    {pending === 'preview' && pendingBackupId === backup.id
                      ? 'Validating…'
                      : 'Review restore'}
                  </button>
                </>
              }
            />
          ))
        )}
      </SettingsSubsection>
      {historyError && (
        <ToastNotice tone="error">
          {historyError}{' '}
          <button
            className="text-button"
            type="button"
            onClick={() => void refreshBackups().catch((e) => setHistoryError(e.message))}
          >
            Refresh history
          </button>
        </ToastNotice>
      )}
      {limit < backups.length && (
        <button
          className="text-button"
          type="button"
          onClick={() => setLimit((current) => current + 10)}
        >
          Show older backups ({backups.length - limit} remaining)
        </button>
      )}
      <p>
        {backups.length} saved {backups.length === 1 ? 'archive' : 'archives'}
      </p>
      {error && !reviewOpen && <ToastMessage message={error} tone="error" />}
      {reviewOpen && (
        <AppDialog
          onClose={closeReview}
          aria-labelledby="backup-review-title"
          className="settings-dialog backup-review-dialog"
        >
          <header className="dialog-heading">
            <h2 id="backup-review-title">Review restore</h2>
            <button
              type="button"
              className="text-button"
              aria-label="Close restore review"
              disabled={pending === 'restore'}
              onClick={closeReview}
            >
              Close
            </button>
          </header>
          <p>
            Requested archive: <code>{pendingBackupId}</code>
          </p>
          {pending === 'preview' && <p role="status">Validating this archive…</p>}
          {error && <ToastMessage message={error} tone="error" />}
          {preview && preview.id === pendingBackupId && (
            <>
              <p>
                Validated archive: <code>{preview.id}</code> · App{' '}
                {preview.manifest.applicationVersion}
              </p>
              <details className="settings-disclosure">
                <summary>Archive manifest details</summary>
                <p>Reason: {preview.manifest.reason}</p>
                <ul>
                  {preview.manifest.files.map((file) => (
                    <li key={file.path}>
                      <code>{file.path}</code> · {formatBytes(file.bytes)}
                    </li>
                  ))}
                </ul>
              </details>
              <p>
                Restore replaces current household data. A safety backup is created first. Saved
                sessions may be replaced.
              </p>
              <SettingsRow title="Backup details">
                <output>
                  {displayDate(preview.manifest.createdAt)} · Schema{' '}
                  {preview.manifest.schemaVersion} · {preview.manifest.files.length} verified files
                </output>
              </SettingsRow>
              <SettingsField
                title="Confirm replacement"
                description="Type RESTORE to replace current household data."
              >
                <input
                  value={confirmation}
                  onChange={(event) => setConfirmation(event.target.value)}
                  autoComplete="off"
                  disabled={pending !== null}
                />
              </SettingsField>
              <SettingsActionBar>
                <button
                  className="text-button"
                  type="button"
                  disabled={pending !== null}
                  onClick={closeReview}
                >
                  Cancel
                </button>
                <button
                  className="danger-button"
                  type="button"
                  onClick={() => void restore()}
                  disabled={
                    confirmation !== 'RESTORE' || pending !== null || preview.id !== pendingBackupId
                  }
                >
                  {pending === 'restore' ? 'Restoring…' : 'Restore backup'}
                </button>
              </SettingsActionBar>
            </>
          )}
        </AppDialog>
      )}
    </SettingsPane>
  );
}
