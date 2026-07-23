# T053 prepared persistence review

Approved T052 after a read-only audit.

- Migration 0021 is additive and fresh migration evidence passed. Prepared, intake, allocation and idempotency links match the schema and migration journal.
- Prepared instances freeze the current calculation, recipe name, actual yield, optional weight, adjustment/alignment snapshot and meal/cook identity. Later recipe edits do not affect recorded portions.
- Consumed values scale the frozen whole-recipe totals by actual prepared servings, not the original configured yield.
- Intake and eaten allocation append in one transaction. A matching retry returns the exact pair; changed key meaning conflicts; failed capacity or integrity checks leave neither side committed.
- The browser cannot submit nutrient totals, provenance or quality. Trusted-origin and Nutrition principal/profile authorization apply at the API/service boundary.
- A cook session must be completed and identity-matched, but cook/Pantry routes remain unchanged and create no Nutrition state automatically.
- Unmatched preparation adjustments block calculated consumption.
- Full gates passed: 170 unit tests, 87 integration tests, lint, typecheck, formatting, scoped diff and fresh SQLite migration.

The next package must add server-validated idempotent non-eaten prepared states and the explicit accessible UI. It may expose only the current authorized profile's allocations plus aggregate used/remaining yield, and it must retain stable client IDs across uncertain retries. Planner-page integration and advanced evidence-backed preparation recalculation remain later boundaries.

The exact GoalBuddy Judge exceeded the single-wait limit and was interrupted. The PM performed the same read-only approval gate as permitted fallback.
