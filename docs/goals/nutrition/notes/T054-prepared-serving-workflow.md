# T054 explicit prepared serving workflow

Completed the user-facing prepared portion boundary inside Nutrition.

- A trusted prepared-allocation service/API records append-only served, skipped and leftover versions, preserves latest-predecessor concurrency, enforces actual-yield capacity, and returns an identical initial/update retry without duplicating versions. Changed series meaning conflicts.
- The prepared workspace exposes only the selected authorized profile's allocation rows. Other profiles contribute only to aggregate assigned/remaining servings; their IDs, notes and states are absent.
- A consumed allocation cannot be changed through the non-eaten state route or consumed again. It must use immutable Food Diary correction/deletion history.
- Overview offers an explicit “Record a prepared batch” action for a current calculated planned meal, using the actual post-cooking yield and a stable client UUID. It clearly states that this records no consumption.
- Food Diary shows actual/assigned/remaining servings, calculation confidence/completeness and alignment. Accessible forms support fractional served portions, skip, leftover, explicit served-to-eaten confirmation, direct partial consumption and seconds.
- Stable client series and idempotency keys are retained across failed/uncertain requests and rotated only after success.
- Only “Confirm eaten” calls the atomic server-built recipe snapshot plus eaten-allocation transaction. Served, skipped and leftover actions create no nutrient intake.
- Unmatched preparation adjustments remain visible and block eaten confirmation.

Evidence passed: 6 focused unit/component tests, 8 focused service/API integration tests, full 171-unit/90-integration suites, lint, typecheck, formatting and scoped diff checks. Rendered browser interaction remains unclaimed.

The exact GoalBuddy Worker exceeded the single-wait limit and was interrupted. The PM completed the exact allowed-file package as permitted fallback.
