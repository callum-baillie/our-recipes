# T049 planned allocation review

Approved T048 after a read-only audit.

- Per-profile projections come only from explicit fractional allocation versions; no equal allocation is inferred.
- Latest versions are selected by allocation series while earlier rows remain immutable. Supersession preserves meal-plan and cook-session identity and rejects a stale predecessor.
- Remaining serving capacity is derived from the latest version of every series and checked inside the allocation append transaction. Skipped rows release capacity; other explicit states remain represented.
- The server returns the authorized profile's own allocation rows and only a non-identifying aggregate assigned amount for all other profiles. No hidden profile, principal or allocation identity is projected.
- Only a normalized calculation matching the current recipe revision supplies planned nutrients. Stale, unavailable and free-form meals remain unknown with quality warnings.
- Planned and served states contribute only to planned totals. Consumed totals continue to use immutable eaten/corrected intake; skipped, leftover, cooked and Pantry states do not enter intake.
- Focused and checkout-wide gates passed: 168 unit tests, 82 integration tests, lint, typecheck, Prettier and scoped diff checks. Rendered evidence remains unclaimed.

The next task must be a read-only map because cook sessions do not currently freeze prepared yield/calculation identity, and existing recipe intake plus allocation writes are separate transactions without an idempotent combined command.

The exact GoalBuddy Judge exceeded the single-wait limit and was interrupted. The PM performed the same read-only approval gate as permitted fallback.
