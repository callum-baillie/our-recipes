# T009 normalized persistence decision

## Decision

Approved. The first persistence slice will add Nutrition-owned normalized facts and immutable recipe calculation revisions on top of Pantry migration `0015`.

This slice deliberately excludes private profile credentials/permissions, goals, intake, meal allocations, routes, and UI. Those areas need their own historical-integrity and authorization review after the shared food/calculation substrate is proven.

## Data boundaries

- `nutrient_definitions` stores the canonical nutrient registry from `NUTRIENT_DEFINITIONS`.
- `nutrition_data_sources` stores explicit provider/manual/calculated/legacy provenance and citation metadata.
- `food_nutrition_records` stores append-only product nutrition revisions attached to `pantry_products`, including basis, density/piece-weight evidence, confidence, completeness, source identity, and attribution.
- `food_nutrient_values` stores normalized values for a food revision. Missing values are absent rows, never zero.
- `nutrition_calculation_versions` identifies deterministic algorithms/factor sets.
- `recipe_nutrition_calculations`, contribution rows, and value rows store immutable recipe calculation revisions tied to the recipe revision, calculation version, source digest, ingredient/product evidence, confidence, and completeness.
- Pantry batches remain physical availability only and intake remains a future, separate immutable snapshot model.

## Legacy decision

Migration `0016` must seed the canonical definitions and a clearly named `legacy_recipe_fields` source, then snapshot every recipe with any existing legacy nutrition field into an immutable calculation/value revision. The eight legacy recipe columns remain readable during transition and are not dropped or rewritten. Legacy values are explicitly marked imported/partial, not silently promoted to authoritative product facts.

## Worker package

Objective: add migration `0016`, schema mappings, strict persistence input schemas, transactional append/read services, deterministic source selection and legacy adaptation, integration tests, and native architecture/data-model/testing/decision documentation.

Allowed files:

- `src/lib/db/schema.ts`
- `drizzle/0016_nutrition_foundation.sql`
- `drizzle/meta/_journal.json`
- `src/lib/domain/nutrition-record.ts`
- `src/lib/services/nutrition-foundation-service.ts`
- `tests/integration/nutrition-foundation-service.test.ts`
- `docs/architecture.md`
- `docs/data-model.md`
- `docs/testing.md`
- `docs/decisions/0029-nutrition-foundation.md`

Verification:

- Focused Prettier and ESLint checks on package files.
- Nutrition unit tests and new integration tests.
- Full lint and typecheck.
- Fresh isolated `db:migrate` and `db:check`, including legacy backfill assertions in integration tests.
- Production build.
- Scoped and repository diff checks.

Stop if:

- Migration `0016` or a newer journal entry appears before patching.
- Pantry T005 rejects a product, mapping, unit, or migration premise used here.
- Any applied migration must change.
- A file outside the allowed set is needed.
- The implementation would update existing food/calculation value rows instead of appending a revision.
- A live provider call, credential, private-profile persistence, medical target, intake assumption, or Pantry batch-as-consumption coupling is required.

## Next review boundary

After this Worker, a Judge must audit migration/backfill idempotence, foreign keys and checks, append-only history, source selection, source citation, confidence/completeness behavior, recipe-revision traceability, and whether the model can be snapshotted into future intake without mutation.
