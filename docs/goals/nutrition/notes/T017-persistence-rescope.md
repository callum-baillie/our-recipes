# T017 non-overlapping persistence rescope

## Decision

Approved. Pantry T009 owns Pantry availability/UI files plus `docs/data-model.md`, `docs/api.md`, `docs/openapi.yaml`, and its own decision. It does not own `src/lib/db/schema.ts` or the three Nutrition-specific domain/service/test files.

The completion Worker is reduced to exactly:

- `src/lib/db/schema.ts`
- `src/lib/domain/nutrition-record.ts`
- `src/lib/services/nutrition-foundation-service.ts`
- `tests/integration/nutrition-foundation-service.test.ts`

The retained migrations and journal remain immutable inputs. The Worker must still prove append-only revisions, source priority, conversion evidence, recipe traceability, sparse missing values, and real legacy backfill. Full lint/typecheck/tests and a fresh migration remain required. Build remains conditional on the live `.next` owner.

After the Worker, a historical-integrity Judge must audit the result. Documentation reconciliation is a separate later Worker after Pantry releases `docs/data-model.md`; existing draft Nutrition text must not be treated as final until then.
