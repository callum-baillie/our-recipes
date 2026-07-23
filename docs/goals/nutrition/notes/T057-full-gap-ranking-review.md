# T057 full-gap ranking review

Approved the T056 gap classification and rank ordering, but required a read-only dependency map before destructive data-rights implementation.

- Private Food Diary lifecycle and data rights remain the top coherent outcome because copy/move/restore/reassign and profile export/deletion are explicit acceptance requirements and avoid Pantry/planner ownership.
- Ordinary diary changes must remain append-only: copy creates a new series with the source frozen snapshot; move and restore append audited corrections; reassignment atomically creates target history and source deletion history after authorizing both profiles.
- Single and multi-entry retries need persisted stable command identity so uncertain retries do not duplicate or partially copy/reassign a day.
- Export must use `export_data` authorization, deterministic bounded JSON, private no-store response headers, and no credentials/secrets or inaccessible profiles.
- Privacy deletion is not an ordinary immutable correction. It requires exact confirmation, optimistic profile version, an explicit irreversible scope and a complete deletion/scrubbing order for self-referential permission/goal/intake/allocation histories, nutrient child rows, measurements, prepared/idempotency commands and shared principals.
- Because the current schema uses many `ON DELETE RESTRICT` and self-references, the Worker boundary cannot be approved safely until a Scout proves the dependency graph and whether lifecycle/export and deletion must split.

The remaining packages from T056 stay ordered after this outcome: preparation-aware calculation; recipe/planner adapters; Pantry/grocery recommendations; settings/charts/household analysis; then performance/offline/docs/final evidence.

The exact GoalBuddy Judge exceeded the single-wait limit and was interrupted. The PM performed the same read-only gate as permitted fallback.
