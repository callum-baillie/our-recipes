# Backup and restore

## What a backup contains

Every local bundle is a gzip-compressed tar archive below `BACKUP_DIR`, which defaults to `DATA_DIR/backups`. It contains:

- a consistent `database.sqlite` snapshot made through SQLite's backup API;
- regular files from `uploads` and `generated` when those directories exist;
- `config.json` with only the household/app display names; and
- `manifest.json` with format/application/schema versions, timestamp, reason, file sizes, and SHA-256 checksums.

The export intentionally excludes `.env` files, OpenAI keys, cookie secrets, trusted origins, and all other environment secrets.

## Create and retain

Use **System Settings → Local recovery → Create backup** for a manual recovery point. The application also schedules an in-process local backup every `BACKUP_INTERVAL_HOURS` (default `24`). On each successful creation it removes bundles older than `BACKUP_RETENTION_DAYS` (default `30`).

For a host backup tool such as Kopia, mount a dedicated host directory into the Bòrd container and set `BACKUP_DIR` to that container path:

```yaml
services:
  bord:
    environment:
      BACKUP_DIR: /backup
    volumes:
      - /mnt/user/backups/bord:/backup
```

Bòrd remains the only writer to this directory and manages its local retention. Configure Kopia to snapshot the host directory (`/mnt/user/backups/bord` in this example) into its independently protected repository. Do not point `BACKUP_DIR` at the Kopia repository itself, and do not let a second tool rewrite Bòrd's `.tar.gz` bundles in place. The effective container path, schedule, and retention are shown read-only in System Settings.

## Validate and restore

1. Open **Backups** and select **Validate & restore** for a listed bundle.
2. The application checks archive paths, rejects links and unsupported entries, enforces byte limits, extracts only to isolated staging, verifies the manifest and every checksum, and runs SQLite `PRAGMA integrity_check`.
3. Review the displayed date/schema/file count. Type `RESTORE` exactly to enable replacement.
4. The application makes a pre-restore safety backup and stages the database/media inside `DATA_DIR`. It replaces the application files with rollback protection while keeping the data directory itself in place, then reopens SQLite, runs migrations, and verifies integrity again. This works when `DATA_DIR` is a Docker bind mount and its parent is not writable. Backups are retained in place; an external `BACKUP_DIR` is not touched by the replacement.

Only locally created, currently listed server bundles are restorable. Uploading an arbitrary archive is deliberately unsupported: it avoids zip-slip, corrupt-archive, and unreviewed compatibility risks. A restore replaces current household data; it is not a merge tool. The selected bundle and the automatically created pre-restore safety bundle survive restoration. Database files must be outside `uploads`, `generated` and `config`, and backup storage must not overlap the replaced media/configuration paths. Only one restore can run in the application process at a time.

The short file-replacement/verification section does not yield to other requests in that process; this is rollback protection, not a crash-atomic transaction across multiple files or independent server processes. Stop other application instances and avoid writes during recovery. A durable `.restore-in-progress.json` marker blocks database use after interrupted/incomplete recovery; health reports `503 recovery_required`. Successful verification or complete rollback removes it. If rollback itself fails, the app retains `.restore-previous-*` and `.restore-new-*` beneath `DATA_DIR`. Stop the app and preserve the entire directory, marker and safety backup for recovery; do not simply remove the marker or delete staging/WAL files from a running instance. Recover into a fresh instance from the validated safety archive, or repair the consistency set offline before clearing the marker. Cleanup failures are logged without reporting a completed restore as unsuccessful.

## Operating policy and failure recovery

The scheduled timer runs inside the single application process, so a stopped app cannot create backups. Keep at least 30 daily recovery points by default, copy a verified bundle to an independently protected location at least weekly, and perform a restore drill after every major upgrade and at least quarterly.

SQLite, `uploads`, and `generated` are one consistency set. Move or restore them only through the backup workflow; copying a live database file or restoring media alone can create broken references. The startup migrator takes a pre-migration SQLite safety copy, but that copy is not a substitute for a complete media backup.

If storage is full or read-only, stop writes, preserve the data directory, free or repair storage outside the app, and restart. Do not delete WAL/SHM files from a running instance. For corruption, stop the app, copy the entire data root for investigation, validate the newest independent bundle, then restore it into a fresh data directory. The health endpoint and System Settings report database integrity and migration status without exposing paths.

`BACKUP_DIR` must be writable by the container's UID/GID `1001`, must be distinct from `DATA_DIR`, and cannot be the filesystem root. The container entrypoint creates the exact configured directory when it can, but the operator remains responsible for host share permissions.

Mounted-volume persistence and Kopia ingestion must be proved on each release-candidate Docker/Unraid host. A source test or prior host run is not evidence for a new target.
