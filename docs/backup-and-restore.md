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

## Current operational boundary

The scheduled timer runs inside the single application process. Docker/Unraid startup scheduling, remote/off-machine replication, and mounted-volume persistence proof are not complete until the deployment package is implemented and verified with a real daemon.
