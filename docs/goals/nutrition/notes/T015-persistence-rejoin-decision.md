# T015 reference and persistence rejoin decision

## Decision

Approved.

The 35 FDA Daily Value rows and units match the current FDA reference table captured by T012. The set validates only as `fda_daily_value`/`label_reference`, excludes under-four/pregnancy/lactation matching, preserves four canonical gaps, and carries source/version/retrieval disclosure and a non-medical disclaimer.

The migration boundary is now stable: the journal applies `0016_nutrition_foundation` followed by `0017_pantry_integrity`. Pantry T007's fresh disposable database migrated through both and passed `db:check`; a fresh Nutrition-side isolated migration and database check also passed. Pantry T008 is read-only. The shared schema may now receive Nutrition mappings without changing Pantry mappings or behavior.

## Worker package

Complete the retained persistence slice by restoring Drizzle schema mappings plus strict Nutrition record inputs, append-only product/recipe revision services, deterministic source selection, and integration tests including a real pre-0016 legacy backfill fixture. Align with the already-created SQL and documentation. Do not edit either migration or the journal.

Allowed files:

- `src/lib/db/schema.ts`
- `src/lib/domain/nutrition-record.ts`
- `src/lib/services/nutrition-foundation-service.ts`
- `tests/integration/nutrition-foundation-service.test.ts`
- `docs/architecture.md`
- `docs/data-model.md`
- `docs/testing.md`
- `docs/decisions/0029-nutrition-foundation.md`

Verification:

- focused Prettier/ESLint;
- existing Nutrition unit tests and new integration tests;
- full lint/typecheck/tests;
- fresh isolated migrations through 0017 and `db:check`;
- production build only if the user-owned Next dev process no longer owns `.next`; otherwise record the environmental gate without claiming build proof;
- scoped and repository diff checks.

Stop if:

- Pantry T008 identifies a schema/migration defect relevant to Nutrition;
- either migration or the journal would need editing;
- any Pantry domain/service/test/UI/API file or unrelated dirty file would need editing;
- append-only facts would need mutation, missing values would become zero, or batches/plans would become intake;
- a live provider/credential/private-profile/route/UI change is required.

Afterward, require a read-only historical-integrity Judge before profile/intake persistence.
