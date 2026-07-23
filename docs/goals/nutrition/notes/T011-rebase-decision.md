# T011 persistence rebase decision

## Decision

Rejected for now. Pantry T007 remains active and owns `src/lib/db/schema.ts` plus `drizzle/meta/_journal.json`. The combined journal currently orders `0016_nutrition_foundation` before `0016_pantry_integrity`, and the SQL concerns are logically separable, but Pantry has not yet published its final receipt or combined fresh-migration verification. T010 therefore cannot safely resume.

## Safe progress while waiting

The next package is a read-only Scout of authoritative nutrient reference sources and target semantics. It does not touch database, Pantry, provider, profile, route, UI, or existing source files. It must produce an evidence map for:

- U.S. Dietary Reference Intakes and tolerable upper limits;
- FDA Daily Values and labeling semantics;
- USDA FoodData Central nutrient/source provenance and API/data licensing;
- energy-factor and nutrient-unit conventions;
- demographic and life-stage applicability boundaries;
- safe product language, disclaimers, and the distinction between informational targets and medical advice.

Only primary official sources may be used. Exact source URLs, document/version dates, accessed date, supported claims, and unresolved gaps must be recorded. No numeric reference set will be implemented until a later Judge approves the evidence and data model.

## Persistence resume gate

After Pantry T007 becomes done or blocked with a stable file boundary, a fresh Judge must rerun combined migration, schema, and dirty-ownership checks before restoring Nutrition schema/service/test work.
