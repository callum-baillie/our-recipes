# Backup and restore

## What a backup contains

Every local bundle is a gzip-compressed tar archive below `DATA_DIR/backups`. It contains:

- a consistent `database.sqlite` snapshot made through SQLite's backup API;
- regular files from `uploads` and `generated` when those directories exist;
- `config.json` with only the household/app display names; and
- `manifest.json` with format/application/schema versions, timestamp, reason, file sizes, and SHA-256 checksums.

The export intentionally excludes `.env` files, OpenAI keys, cookie secrets, trusted origins, and all other environment secrets.

## Create and retain

Use **Backups → Create backup** for a manual recovery point. The application also schedules an in-process local backup every `BACKUP_INTERVAL_HOURS` (default `24`). On each successful creation it removes bundles older than `BACKUP_RETENTION_DAYS` (default `30`). Keep `DATA_DIR/backups` on the same durable volume as the application data, then copy verified downloaded bundles to an independently protected location as part of household operations.

## Validate and restore

1. Open **Backups** and select **Validate & restore** for a listed bundle.
2. The application checks archive paths, rejects links and unsupported entries, enforces byte limits, extracts only to isolated staging, verifies the manifest and every checksum, and runs SQLite `PRAGMA integrity_check`.
3. Review the displayed date/schema/file count. Type `RESTORE` exactly to enable replacement.
4. The application makes a pre-restore safety backup, builds a restored data root, swaps it with rollback protection, reopens SQLite, runs migrations, and verifies integrity again.

Only locally created, currently listed server bundles are restorable. Uploading an arbitrary archive is deliberately unsupported: it avoids zip-slip, corrupt-archive, and unreviewed compatibility risks. A restore replaces current household data; it is not a merge tool.

## Operating policy and failure recovery

The scheduled timer runs inside the single application process, so a stopped app cannot create backups. Keep at least 30 daily recovery points by default, copy a verified bundle to an independently protected location at least weekly, and perform a restore drill after every major upgrade and at least quarterly.

SQLite, `uploads`, and `generated` are one consistency set. Move or restore them only through the backup workflow; copying a live database file or restoring media alone can create broken references. The startup migrator takes a pre-migration SQLite safety copy, but that copy is not a substitute for a complete media backup.

If storage is full or read-only, stop writes, preserve the data directory, free or repair storage outside the app, and restart. Do not delete WAL/SHM files from a running instance. For corruption, stop the app, copy the entire data root for investigation, validate the newest independent bundle, then restore it into a fresh data directory. The health endpoint and System Settings report database integrity and migration status without exposing paths.

Mounted-volume persistence must be proved on each release-candidate Docker/Unraid host. A source test or prior host run is not evidence for a new target.
