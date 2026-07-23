# T050 prepared recipe and atomic consumption map

## Current boundary

- `cook_sessions` records recipe, household actor, target servings, optional planned meal and start/completion times. It does not freeze a recipe calculation, actual prepared yield, final weight or Nutrition adjustment state.
- Pantry cooking confirmation transactionally records ingredient deductions, Pantry leftover batches and cook completion. It intentionally creates no Nutrition intake or serving allocation and must remain independent.
- Dedicated recipe intake builds a frozen nutrient/provenance snapshot on the server from one immutable recipe calculation, then commits through `appendNutritionIntakeRevision`.
- Eaten allocation validation requires a current consumed intake series, but allocation append is a separate transaction. A client performing both calls can leave intake without allocation, and retry cannot atomically return the original pair.
- Allocation versions can link planned meals and cook sessions but not a prepared recipe identity. Intake revisions do not snapshot planned-meal, cook-session or prepared-instance links.
- Recipe calculations currently model mapped ingredients and explicit optional-ingredient inclusion. They do not yet model arbitrary substitutions, excluded required ingredients or actual retention/yield changes.

## Required persistence and transaction

Add one additive migration and matching schema for:

- an immutable `nutrition_prepared_recipe_instances` record that freezes recipe ID, recipe-calculation ID, optional meal-plan and completed cook-session links, actual serving yield, optional final weight, calculation-alignment state, explicit optional-ingredient/adjustment snapshot, note, actor and time;
- nullable prepared-instance/planned-meal/cook-session links on intake revisions and a prepared-instance link on allocation versions;
- a `nutrition_consumption_commands` idempotency record keyed by Nutrition principal plus bounded client request key, storing a canonical request digest and the exact created intake revision/allocation version pair.

Refactor the intake and allocation append logic into transaction-aware internal helpers while preserving their existing public wrappers. One explicit prepared-consumption service transaction must:

1. authorize `manage_profile`;
2. validate the prepared instance, its frozen calculation and requested portion;
3. reject an adjustment state not represented by that calculation;
4. resolve or validate an optional latest planned/served allocation predecessor;
5. enforce prepared-yield capacity against latest allocation versions;
6. build the recipe intake values/provenance on the server;
7. append the immutable eaten intake and linked eaten allocation;
8. store the idempotency command; and
9. on retry, return the same pair only when the canonical digest matches, otherwise reject key reuse.

Partial servings and seconds are independent explicit commands/series. A planned portion may be superseded by its eaten state. Skips and leftovers remain non-consumed allocation versions. No cook or Pantry route calls this service automatically.

## Safe split

The next Worker should implement the migration/schema, strict request schemas, transaction-aware service internals, prepared-instance and atomic-confirmation services, trusted-origin Nutrition APIs, and focused unit/integration/API tests. It must avoid cook, Pantry and planner files.

A following reviewed Worker must expose the prepared/served/eaten/leftover workflow in the Nutrition UI. A later recipe-calculation slice must add evidence-backed required-ingredient exclusion/substitution and actual-yield recalculation; until then, prepared instances with unmatched adjustments must not be consumable as calculated nutrition.

The exact GoalBuddy Scout exceeded the single-wait limit and was interrupted. The PM completed the same read-only map as permitted fallback.
