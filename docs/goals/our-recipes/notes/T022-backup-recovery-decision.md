# T022 — backup and recovery decision

## Ranked remaining gaps

1. **Backup and recovery:** `DATA_DIR` now holds both SQLite state and normalized local photos. The release oracle specifically requires verified database/media/config backups, manifest checksums, retention, restore preview, explicit confirmation, pre-restore safety backup, and integrity proof. This is fully local and testable without Docker.
2. **Docker/Unraid packaging and persistence:** release-critical but depends on a daemon and operator-mounted volume. The next backup package defines the data shape that deployment will mount and preserve; it must not claim container proof.
3. **PDF/archive/handwriting/OCR capture:** important, but requires separate upload/document/archive threat handling and review semantics. It must not be combined with backup-archive extraction.
4. **AI-assisted normalization/generation:** remains credential- and paid-approval-gated. Mock seams can be added later without live traffic.
5. **Richer organization/performance/final audit:** follow recovery and deployment proof.

## Decision

T023 should implement the local operator recovery workflow. Backups must use SQLite's safe backup API, include uploaded/generated media plus safe export configuration, and create a manifest with application/schema versions, timestamp, and SHA-256 checksums. The worker should add bounded scheduled creation and retention cleanup, server-side list/download/preview, validation before restore, explicit `RESTORE` confirmation, a pre-restore safety backup, path-constrained archive handling, database integrity check, and isolated round-trip proof. Restoration accepts only locally created, manifest-validated backup bundles; it must neither accept arbitrary uploaded archives nor silently overwrite current data.

Docker/Unraid verification stays explicitly deferred until a daemon and mounted-volume operator environment are available.
