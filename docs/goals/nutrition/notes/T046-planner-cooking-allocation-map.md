# T046 planner, cooking and allocation map

The existing model already contains the core event distinctions, but the application does not yet join them into a usable planned-nutrition flow.

## Current data flow

- `meal_plan_entries` stores a date, meal slot, recipe/free-form title and total integer servings. The current planner's household-profile selection only derives the serving count in client state; selected identities are not persisted.
- `cook_sessions` stores the recipe, active household profile, target servings, optional meal-plan entry, start time and completion time. Cooking completion and Pantry confirmation do not create Nutrition intake.
- Pantry cooking confirmation records explicit ingredient deductions and optional leftover Pantry batches. Those are inventory events, not serving allocation or consumption events.
- `nutrition_meal_allocation_versions` is append-only by series/revision, profile-authorized, linked to a meal-plan entry and/or cook session, and supports `planned`, `served`, `eaten`, `skipped` and `leftover`. Only an `eaten` allocation can link a current consumed intake series.
- `nutrition_intake_revisions` holds immutable eaten/corrected snapshots. Dedicated recipe intake builds values and provenance on the server from a calculation ID and portion.
- Current `/nutrition` only counts latest allocation states. It does not calculate per-person planned nutrients, expose meal allocations, or compare planned and consumed totals.
- Current planner, planning domain/service and planner page are dirty under the concurrent Pantry goal. Pantry T024 is read-only, but those dirty files remain shared ownership and are not safe for this slice.

## Risks and invariants

- Planner household profiles and private Nutrition profiles are different identities. A UI must use only profiles authorized through the Nutrition principal and must never assume household membership grants diary access.
- Total meal servings must not be divided equally. Each profile allocation is explicit and partial servings are valid; the remaining amount is an explicit unassigned quantity.
- Latest allocation revisions, not all historical versions, drive projections. Old versions remain immutable.
- Only current recipe calculations may be projected as current. Missing or stale normalized calculations must surface as unavailable/incomplete instead of silently using legacy values or zero.
- Planned, served and leftover states must never enter consumed totals. Only immutable current eaten/corrected intake revisions do.
- Cross-profile sums may reveal private data. The first slice should return only the requested authorized profile's allocation details plus a non-identifying total assigned amount needed to calculate the shared unassigned pool.
- The later eaten-confirmation boundary must create intake and the linked eaten allocation transactionally and idempotently; sequential client calls could leave partial truth after a retry.

## Safe next package

Build a Nutrition-owned planned-meal projection slice without editing dirty planner or Pantry files:

- Add pure meal-projection domain logic that scales current recipe nutrient totals by explicit allocation servings and compares planned with consumed totals while keeping unknown values unknown.
- Add a server service that authorizes the requested Nutrition profile, selects meal-plan entries for a validated date range, resolves current recipe calculations, reads latest allocation revisions, and returns privacy-minimal profile rows plus explicit aggregate assigned and unassigned servings.
- Add a trusted-origin, validated Nutrition API for listing meal projection candidates and appending/superseding the requested profile's planned/served/skipped/leftover allocations using the existing append-only allocation service.
- Add an accessible allocation/projection panel inside `/nutrition` showing explicit fractional portions, calculation quality, unassigned servings, and planned-versus-consumed nutrient totals. Do not add an equal-split action.
- Add unit and integration tests for partial/uneven allocation, latest-version selection, unassigned math, stale/unavailable calculations, profile authorization/privacy, planned-not-consumed behavior, validation and optimistic supersession conflicts.

Cooking, Pantry confirmation, served-to-eaten transactionality, leftovers tied to prepared instances, and the planner-page adapter remain the next separately judged boundary.

The exact GoalBuddy Scout exceeded the single-wait limit and was interrupted. The PM completed the same read-only map as permitted fallback.
