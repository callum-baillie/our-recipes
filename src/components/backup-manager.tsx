'use client';

import { ArchiveRestore, Clock3, Download, FolderArchive, ShieldCheck } from 'lucide-react';
import { useState } from 'react';

import { useToast } from '@/components/toast-provider';
import { InlineSkeleton } from '@/components/skeleton';

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

  async function refreshBackups() {
    const response = await fetch('/api/v1/backups');
    const body = (await response.json().catch(() => null)) as { backups?: BackupSummary[] } | null;
    if (response.ok && body?.backups) setBackups(body.backups);
  }

  async function create() {
    setPending('create');
    setError(null);
    const response = await fetch('/api/v1/backups', { method: 'POST' });
    const body = (await response.json().catch(() => null)) as {
      error?: { message?: string };
    } | null;
    setPending(null);
    if (!response.ok) {
      const message = body?.error?.message ?? 'We could not create a backup yet.';
      setError(message);
      showToast(message, 'error');
      return;
    }
    await refreshBackups();
    showToast('Backup created and verified.', 'success');
  }

  async function inspect(id: string) {
    setPending('preview');
    setError(null);
    const response = await fetch(`/api/v1/backups/${id}`);
    const body = (await response.json().catch(() => null)) as {
      backup?: BackupPreview;
      error?: { message?: string };
    } | null;
    setPending(null);
    if (!response.ok || !body?.backup) {
      const message = body?.error?.message ?? 'We could not validate that backup.';
      setError(message);
      showToast(message, 'error');
      return;
    }
    setPreview(body.backup);
    setConfirmation('');
    showToast('Backup validated. Review it before restoring.', 'success');
  }

  async function restore() {
    if (!preview || confirmation !== 'RESTORE') return;
    setPending('restore');
    setError(null);
    const response = await fetch(`/api/v1/backups/${preview.id}/restore`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ confirmation }),
    });
    const body = (await response.json().catch(() => null)) as {
      error?: { message?: string };
    } | null;
    setPending(null);
    if (!response.ok) {
      const message = body?.error?.message ?? 'The backup could not be restored safely.';
      setError(message);
      showToast(message, 'error');
      return;
    }
    window.location.assign('/');
  }

  return (
    <section className="backup-manager" aria-labelledby="backup-manager-title">
      <div className="backup-intro">
        <div>
          <p className="eyebrow">LOCAL RECOVERY</p>
          <h1 id="backup-manager-title">Keep the kitchen recoverable.</h1>
          <p>
            Backups stay on this server. Each one includes a consistent SQLite snapshot, local
            recipe media, safe household metadata, and a checksum manifest—never secrets.
          </p>
        </div>
        <button
          className="primary-button"
          type="button"
          aria-busy={pending === 'create'}
          onClick={() => void create()}
          disabled={pending !== null}
        >
          {pending === 'create' ? (
            <InlineSkeleton label="Creating backup" width="1.1rem" />
          ) : (
            <ArchiveRestore size={17} />
          )}
          Create backup
        </button>
      </div>
      <div className="backup-safety">
        <ShieldCheck size={20} aria-hidden="true" />
        <p>
          Restore only validates server-created bundles. It makes a fresh safety backup first and
          requires you to type <strong>RESTORE</strong> before current household data changes.
        </p>
      </div>
      <div className="backup-destination" aria-label="Backup destination">
        <div className="backup-destination-copy">
          <FolderArchive size={20} aria-hidden="true" />
          <div>
            <p className="backup-destination-title">
              {storage.location === 'dedicated'
                ? 'Dedicated backup directory'
                : 'Application data directory'}
            </p>
            <p>
              {storage.location === 'dedicated'
                ? 'Ready for Kopia or another host backup tool to snapshot independently.'
                : 'Set BACKUP_DIR to a mounted directory such as /backup to separate recovery bundles from app data.'}
            </p>
          </div>
        </div>
        <code>{storage.directory}</code>
        <div className="backup-policy" aria-label="Automatic backup policy">
          <span>
            <Clock3 size={15} aria-hidden="true" />
            Every {storage.intervalHours} {storage.intervalHours === 1 ? 'hour' : 'hours'}
          </span>
          <span>
            Keep {storage.retentionDays} {storage.retentionDays === 1 ? 'day' : 'days'}
          </span>
        </div>
      </div>
      {error && (
        <p className="form-error" role="alert">
          {error}
        </p>
      )}
      <div className="backup-list" aria-live="polite">
        {backups.length ? (
          backups.map((backup) => (
            <article key={backup.id}>
              <div>
                <p>{displayDate(backup.createdAt)}</p>
                <span>
                  {formatBytes(backup.bytes)} · {backup.id.slice(0, 8)}
                </span>
              </div>
              <div className="backup-actions">
                <a className="text-button" href={`/api/v1/backups/${backup.id}/download`}>
                  <Download size={16} /> Download
                </a>
                <button
                  className="text-button"
                  type="button"
                  aria-busy={pending === 'preview'}
                  onClick={() => void inspect(backup.id)}
                  disabled={pending !== null}
                >
                  {pending === 'preview' ? (
                    <InlineSkeleton label="Validating backup" width="1rem" />
                  ) : (
                    <ShieldCheck size={16} />
                  )}
                  Validate &amp; restore
                </button>
              </div>
            </article>
          ))
        ) : (
          <p className="empty-note">
            No backups yet. Create one before your next big recipe session.
          </p>
        )}
      </div>
      {preview && (
        <section className="restore-review" aria-labelledby="restore-review-title">
          <p className="eyebrow">VALIDATED BACKUP</p>
          <h2 id="restore-review-title">Ready to restore, if you mean it.</h2>
          <dl>
            <div>
              <dt>Created</dt>
              <dd>{displayDate(preview.manifest.createdAt)}</dd>
            </div>
            <div>
              <dt>Schema</dt>
              <dd>{preview.manifest.schemaVersion}</dd>
            </div>
            <div>
              <dt>Verified files</dt>
              <dd>{preview.manifest.files.length}</dd>
            </div>
          </dl>
          <label>
            <span>Type RESTORE to replace current household data</span>
            <input
              value={confirmation}
              onChange={(event) => setConfirmation(event.target.value)}
              autoComplete="off"
            />
          </label>
          <button
            className="danger-button"
            type="button"
            aria-busy={pending === 'restore'}
            onClick={() => void restore()}
            disabled={confirmation !== 'RESTORE' || pending !== null}
          >
            {pending === 'restore' ? (
              <InlineSkeleton label="Restoring backup" width="1.1rem" />
            ) : null}
            Restore this backup
          </button>
        </section>
      )}
    </section>
  );
}
