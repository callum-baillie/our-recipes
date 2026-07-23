# T005 migration and data-integrity review

Decision: rejected. The additive migration and ActorContext boundary are directionally sound, but five invariants must be repaired before recipe demand can depend on Pantry:

1. exact and approximate measurements are not mutually exclusive in Zod or SQL;
2. undo snapshots omit product and source provenance changed by batch edits;
3. timestamp-only event ordering cannot deterministically identify the latest tied event;
4. archiving a product can hide its active physical batches;
5. FEFO ignores effective opened shelf life and does not fail when an optimistic multi-batch update changes zero rows.

The next task is a bounded repair using only schema, unapplied migration 0015, Pantry domain/service, and Pantry tests. All concurrent nutrition, recipe reaction, planner, cooking, API, CSS, docs, and E2E changes remain protected.
