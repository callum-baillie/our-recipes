# T038 recipe Nutrition vertical slice

Implemented a production path from product evidence to explicit confirmed intake without schema, migration, Pantry T017, shared-doc, live OpenAI, or `.next` changes.

## Delivered

- A pure evidence-backed conversion domain with strict unambiguous recipe-yield parsing. Same-family mass/volume/count conversions work; density, piece weight, and serving weight are required for supported cross-basis cases; custom/package guesses are rejected with specific missing reasons.
- Authenticated manual Pantry-product nutrition records using immutable revisions and a versioned built-in manual source. Corrections must supersede the latest record and retain the old revision.
- Deterministic current-recipe calculations from the recipe revision, ingredient rows, Pantry mappings, preferred immutable food records, explicit optional inclusion, and source-record revisions. Identical inputs are idempotent; changed inputs append and supersede. Contributions freeze record IDs, multipliers, optional state, quality, and missing evidence.
- Reliable supplied energy is preferred. When it is absent but protein, carbohydrate, and fat are present, the existing documented 4-4-9-7 resolver supplies a marked macro fallback. Material inconsistencies and ambiguous servings are warnings.
- A private Nutrition-page workspace that visibly separates label/source entry, raw-ingredient calculation, quality/warnings, totals/per-serving values, and an explicit Food Diary confirmation. It does not claim cooking, planning, or Pantry stock is consumption.
- A dedicated exact-origin, signed-session recipe-consumption API that accepts only calculation ID, serving count, timestamp, and meal slot. The server loads/scales the immutable calculation, freezes its source/version/digest and nutrient values, then relies on existing `manage_profile` authorization and append-only intake persistence.

## Verification

- Focused unit: 5 tests passed for ambiguous servings, exact mass/density/count/serving conversions, rejected guesses, and rendered communication semantics.
- Focused integration: 2 tests passed for manual record corrections, calculation idempotency/supersession, macro fallback, missing evidence, frozen confirmed intake, trusted origin, signed session, and rejection of nutrient/provenance injection into the dedicated route.
- Full `pnpm lint` and `pnpm typecheck`: pass.
- Full `pnpm test`: 160 unit and 75 integration tests passed.
- Focused Prettier and scoped `git diff --check`: pass.
- Build and rendered browser proof were not attempted because the pre-existing Next dev process owns shared `.next`, as recorded by the active Pantry goal.

## Required Judge boundary

The dedicated route is server-snapshotted, but the pre-existing generic `POST /api/v1/nutrition/profiles/{profileId}/intake` route still accepts a complete consumed nutrient/provenance payload. The Judge must test whether that route can submit a recipe calculation with attacker-chosen nutrient totals despite matching identity fields. If so, reject this milestone and scope a narrow route hardening repair; do not weaken direct server service tests or correction history.

The exact GoalBuddy Worker exceeded the single-wait limit. The PM completed the exact allowed-file package as permitted fallback.
