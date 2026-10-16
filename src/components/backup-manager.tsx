'use client';

import { ArchiveRestore, Download, ShieldCheck } from 'lucide-react';
import { useState } from 'react';

import { useToast } from '@/components/toast-provider';
import { InlineSkeleton } from '@/components/skeleton';
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
  const [pendingBackupId, setPendingBackupId] = useState<string | null>(null);

  async function refreshBackups() {
    const response = await fetch('/api/v1/backups');
    const body = (await response.json().catch(() => null)) as { backups?: BackupSummary[] } | null;
    if (response.ok && body?.backups) setBackups(body.backups);
  }

  async function create() {
    setPending('create');
    setError(null);
    try {
      const response = await fetch('/api/v1/backups', { method: 'POST' });
      const body = (await response.json().catch(() => null)) as {
        error?: { message?: string };
      } | null;
      if (!response.ok) {
        const message = body?.error?.message ?? 'We could not create a backup yet.';
        setError(message);
        showToast(message, 'error');
        return;
      }
      await refreshBackups();
      showToast('Backup created and verified.', 'success');
    } catch (cause) {
      const message = cause instanceof Error ? cause.message : 'Check your connection and retry.';
      setError(message);
      showToast(message, 'error');
    } finally {
      setPending(null);
    }
  }

  async function inspect(id: string) {
    setPendingBackupId(id);
    setPending('preview');
    setError(null);
    try {
      const response = await fetch(`/api/v1/backups/${id}`);
      const body = (await response.json().catch(() => null)) as {
        backup?: BackupPreview;
        error?: { message?: string };
      } | null;
      if (!response.ok || !body?.backup) {
        const message = body?.error?.message ?? 'We could not validate that backup.';
        setError(message);
        showToast(message, 'error');
        return;
      }
      setPreview(body.backup);
      setConfirmation('');
      showToast('Backup validated. Review it before restoring.', 'success');
    } catch (cause) {
      const message = cause instanceof Error ? cause.message : 'Check your connection and retry.';
      setError(message);
      showToast(message, 'error');
    } finally {
      setPending(null);
    }
  }

  async function restore() {
    if (!preview || confirmation !== 'RESTORE') return;
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
    } catch (cause) {
      const message = cause instanceof Error ? cause.message : 'Check your connection and retry.';
      setError(message);
      showToast(message, 'error');
    } finally {
      setPending(null);
    }
  }

  return (
    <SettingsPane
      id="backups"
      title="Backups & recovery"
      description="Create and restore local copies of your recipes, media, and household data. Server credentials are excluded."
    >
      <SettingsRow
        title="Create a backup"
        description="Save a consistent snapshot now. A checksum manifest is verified before the backup is listed."
      >
        <button
          className="secondary-button"
          type="button"
          onClick={() => void create()}
          disabled={pending !== null}
        >
          {pending === 'create' ? (
            <InlineSkeleton label="Creating backup" width="1rem" />
          ) : (
            <ArchiveRestore size={17} />
          )}
          {pending === 'create' ? 'Creating…' : 'Create backup'}
        </button>
      </SettingsRow>
      <SettingsRow
        title="Automatic backups"
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
          backups.map((backup) => (
            <SettingsItem
              key={backup.id}
              title={displayDate(backup.createdAt)}
              description={`${formatBytes(backup.bytes)} · ${backup.id.slice(0, 8)}`}
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
      {error && (
        <p className="form-error settings-inline-status" role="alert">
          {error}
        </p>
      )}
      {preview && (
        <SettingsSubsection
          title="Restore this backup"
          description="This replaces the current household data with the validated snapshot."
        >
          <SettingsRow title="Backup details">
            <output>
              {displayDate(preview.manifest.createdAt)} · Schema {preview.manifest.schemaVersion} ·{' '}
              {preview.manifest.files.length} verified files
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
              onClick={() => {
                setPreview(null);
                setConfirmation('');
              }}
            >
              Cancel
            </button>
            <button
              className="danger-button"
              type="button"
              onClick={() => void restore()}
              disabled={confirmation !== 'RESTORE' || pending !== null}
            >
              {pending === 'restore' ? 'Restoring…' : 'Restore backup'}
            </button>
          </SettingsActionBar>
        </SettingsSubsection>
      )}
    </SettingsPane>
  );
}
