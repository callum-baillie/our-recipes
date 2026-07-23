# T052 prepared recipe persistence and atomic consumption

Delivered the additive persistence and trusted API boundary for explicit prepared-recipe consumption.

- Migration `0021_nutrition_prepared_consumption.sql` and the matching schema/journal add immutable prepared recipe instances, prepared/planned/cook links on intake, prepared links on allocation, and principal-scoped idempotency commands. Applied migrations were not edited.
- Prepared creation uses a client UUID plus canonical request digest, freezes recipe/calculation identity, recipe name, actual serving yield, optional final weight, meal/cook links, adjustment/alignment state, actor and time, and returns the same instance for an identical retry.
- A cook-session link must be complete and match the calculation recipe and planned meal. Neither cook nor Pantry routes were changed and neither creates Nutrition intake.
- Arbitrary exclusions/substitutions/yield-retention adjustments set `requires_recalculation`; those prepared instances cannot create calculated consumption until matching evidence exists.
- Existing intake/allocation append paths now expose transaction-aware internals while their public wrappers and existing routes retain behavior.
- One prepared-consumption transaction authorizes the profile, verifies prepared ownership/alignment, enforces actual prepared-yield and meal capacity, server-builds a recipe snapshot, appends eaten intake and linked eaten allocation, and stores the command result.
- A matching principal/key/digest retry returns the exact prior intake/allocation IDs without adding rows. Changed key meaning is a conflict and the whole transaction rolls back. Partial servings and seconds use explicit commands.
- Nutrients scale from the frozen whole-recipe calculation using actual prepared servings. A later recipe rename/revision does not change the prepared name or consumed nutrient snapshot.
- Trusted Nutrition routes expose prepared list/create and explicit consumption; strict schemas reject browser-supplied nutrient snapshots.

Evidence passed: 2 focused unit tests, 5 focused service/API integration tests, 15 combined prepared/intake/foundation integration tests, fresh SQLite migration through 0021, full 170-unit/87-integration suites, lint, typecheck, Prettier and scoped diff checks. UI/rendered behavior remains deliberately unclaimed.

The exact GoalBuddy Worker exceeded the single-wait limit and was interrupted. The PM completed the exact allowed-file package as permitted fallback.
