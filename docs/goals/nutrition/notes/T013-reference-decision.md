# T013 reference-system decision

## Decision

Approved a pure-domain reference package that does not touch database, migrations, Pantry, profiles, routes, UI, or providers.

The package will model source/version metadata, DRI/DV reference kinds, value/range/percent-energy forms, demographic and life-stage applicability, UL source scope, explicit absence, consent-aware estimated-energy inputs, and required disclaimers. It will include the currently published FDA adult/children 4+ Daily Value table as a general label-reference dataset because T012 captured a single current FDA primary page with exact values and units.

It will not ship numeric RDA/AI/EAR/UL/AMDR/CDRR rows yet. Those values span multiple report years and footnote scopes and require a separate reviewed data-extraction package.

## Canonical-code boundary

The reference layer must identify chloride, chromium, molybdenum, and niacin equivalents as pending canonical gaps. It may represent them in a broader `ReferenceNutrientCode` type but must not silently alias them to a different existing nutrient. Extending the persisted canonical catalog waits for the migration rebase review.

## Worker package

Objective: implement versioned reference-system types/validators, life-stage matching, safe semantic evaluation, the cited FDA adult/children 4+ DV dataset, disclosure helpers, gap detection, and focused tests/documentation.

Allowed files:

- `src/lib/domain/nutrition-reference.ts`
- `tests/unit/nutrition-reference.test.ts`
- `docs/decisions/0030-nutrition-reference-systems.md`

Verification:

- focused Prettier and ESLint;
- focused reference and existing Nutrition unit tests;
- full typecheck;
- scoped diff check.

Stop if:

- another task creates any allowed file first;
- implementation needs to alter canonical codes, schema, migrations, persisted values, private profiles, routes, UI, provider credentials, or other files;
- a claim lacks direct T012 primary-source support;
- FDA DV is used as personalized DRI/medical advice;
- numeric DRI rows or generic nutrient-form conversions become necessary.

## Required next review

A Judge must verify every FDA row/unit against the cited page, ensure reference/DV/DRI distinctions and life-stage applicability are explicit, and confirm unresolved canonical gaps remain visible before any UI or database use.
