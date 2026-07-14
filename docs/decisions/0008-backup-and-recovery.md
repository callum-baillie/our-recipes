# 0008 — local backup and recovery bundles

## Context

The durable data root now contains SQLite and normalized recipe media. Recovery must be testable before Docker/Unraid packaging, while avoiding arbitrary archive upload/extraction and silent data loss.

## Decision

Create server-generated `.tar.gz` bundles below `DATA_DIR/backups`. A bundle contains a SQLite backup-API snapshot, regular local uploads/generated files, safe display metadata, and a SHA-256 manifest with application/schema versions. A process-local timer creates scheduled bundles and retention removes old bundles after successful creation.

Only a currently listed local bundle can be previewed or restored. Preview validates tar paths/types/byte limits, extracts into isolated staging, checks manifest/files/checksums, and runs SQLite integrity. Restore requires exact `RESTORE`, creates a pre-restore safety backup, swaps durable roots with rollback protection, then reopens/migrates/checks SQLite.

## Consequences

The household has a real, locally verified recovery path for database and images without secret export or arbitrary archive intake. It is not remote replication, a merge system, or Docker/Unraid proof; those remain explicit operational packages.
