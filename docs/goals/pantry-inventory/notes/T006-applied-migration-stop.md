# T006 applied-migration stop

The Worker stopped before editing. Migration 0015 has already been recorded in `data/our-recipes.db` and a generated `.next/standalone` database, so repository guidance makes it immutable even though the Pantry tables appear unused. No persistent database was mutated during this check.

The repair must use a new additive migration. T007 adds Pantry migration 0017 (0016 was claimed concurrently by nutrition work) for database-boundary measurement validation, deterministic event sequencing, and active-stock product archive protection, while domain/service/test repairs remain in the original bounded scope.
