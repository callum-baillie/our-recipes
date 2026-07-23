# T008 Pantry compatibility audit

## Result

The Pantry foundation package is complete and is stable enough for Nutrition to build on without taking ownership of Pantry behavior.

## Evidence

- Pantry board task T004 is `done` with a recorded receipt covering migration `0015`, schema, domain, service, trusted-origin APIs, top-level UI, tests, documentation, OpenAPI validation, build, and an isolated fresh-database migration.
- A fresh Nutrition-side check passed all 5 Pantry unit tests and all 4 Pantry integration tests.
- `pantry_products` is the canonical purchasable-food identity. `pantry_batches` stores physical stock and must remain separate from nutrient facts and intake.
- `recipe_ingredient_product_mappings` is the explicit recipe-ingredient-to-product seam. Nutrition may reference products and mappings but must not infer that a batch is eaten merely because it exists or was planned.
- Pantry inventory events are immutable stock history with optimistic versions, FEFO deduction, attribution, and undo seams. Nutrition consumption must use its own immutable snapshot/event model and may link Pantry events only as provenance.
- Pantry T005 is a read-only Judge audit. Its active scope does not own `src/lib/db/schema.ts`, the migration journal, or future additive migration files.

## Migration and ownership boundary

- `0015_pantry_inventory.sql` is applied migration history and must not be edited.
- The next additive migration is `0016_nutrition_foundation.sql`.
- Current Pantry files, Pantry board files, recipe-reaction files, and all unrelated dirty files remain externally owned.
- Nutrition may append to the current schema and migration journal only after rereading their latest contents immediately before patching.

## Stable Nutrition contract

- Attach normalized food nutrient records to `pantry_products.id`.
- Keep source records, nutrient values, confidence/completeness, and calculation versions in Nutrition-owned tables.
- Treat batch quantities as availability inputs only.
- Preserve unit semantics: mass/volume/count conversion is allowed only when compatible or when explicit density/piece-weight evidence exists.
- Use recipe mappings as a contribution input; unmapped ingredients remain visible missing-data gaps.

## Safe first persistence slice

The first slice may add canonical nutrient definitions, data-source provenance, product nutrition records and values, calculation versions, and immutable recipe-calculation revisions with legacy-field adaptation. Profile credentials, permissions, goals, intake snapshots, routes, and UI should remain separate reviewed packages.

## Stop conditions

- Stop if Pantry T005 identifies a blocking defect that changes the product, mapping, unit, or migration contract.
- Stop if migration `0016` appears or the journal changes after the Worker scope is approved.
- Stop if implementing the slice requires editing Pantry migration/service/API/UI files or treating Pantry/planner state as consumption.
