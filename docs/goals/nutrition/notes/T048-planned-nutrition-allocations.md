# T048 planned nutrition and explicit allocations

Delivered a Nutrition-owned planned-meal projection and allocation slice without editing the concurrent dirty planner or Pantry files.

- Pure domain helpers select the latest immutable allocation version per series, scale current normalized recipe totals for fractional servings, aggregate nutrient values, compare planned with consumed totals, and derive assigned, unassigned and over-allocated servings.
- The server projection authorizes the requested Nutrition profile, validates a maximum 31-day range, lists shared meal-plan facts, exposes only that profile's allocation details, and reduces every other profile to a non-identifying assigned-serving aggregate.
- Only calculations matching the current recipe revision produce planned nutrients. Stale, missing and free-form meal evidence remains explicitly unavailable rather than zero or legacy data.
- Planned and served allocation states contribute to planned projections. Eaten totals continue to come only from immutable intake revisions; skipped and leftover portions do not become planned or consumed values.
- Allocation supersession preserves meal-plan and cook-session identity, still requires the latest predecessor, and now checks remaining meal capacity inside the append transaction. Fractional uneven portions are supported and over-allocation conflicts are rejected.
- `/nutrition` now shows the next seven days of meals, total/assigned/unassigned servings, explicit per-profile portion forms, calculation confidence/completeness, and today's planned-versus-consumed calories/macros. No equal-split action exists.

Verification passed: focused unit tests (2), focused integration tests (8 across the new service and intake regression), full 168-unit/82-integration test suites, full lint, typecheck, focused Prettier and scoped diff checks. Rendered browser behavior remains unclaimed.

The exact GoalBuddy Worker exceeded the single-wait limit and was interrupted. The PM completed the exact allowed-file package as permitted fallback.
