# T003 — Nutrition architecture and first-slice decision

## Decision

Approved with a staged architecture. The exact GoalBuddy Judge was attempted and stopped after the single-wait limit; this is the permitted PM fallback. The repository map proves that the broad outcome requires multiple vertical slices and a real Nutrition authorization seam, but the current worktree has concurrently changing Pantry schema/migration/domain files plus unrelated recipe/reaction edits. The largest safe first package is therefore a comprehensive pure Nutrition domain kernel and unit suite in two new files only.

## Architecture

1. **Canonical definitions and arithmetic:** one server-safe domain contract owns nutrient identities, canonical units, categories, default visibility, nutrient-vector arithmetic, energy fallback/source priority, macro-energy distribution, completeness/confidence, recipe contribution aggregation, target/range/limit semantics, planned-versus-consumed totals, rolling averages with missing days, and normalized household comparison datasets.
2. **Normalized persistence:** after Pantry schema work stabilizes, an append-only Nutrition migration adds versioned definitions, authoritative reference rows, sources, food/product nutrient records, recipe calculations and versions, profiles/permissions/goals, prepared instances, allocations, consumption and immutable snapshots. Existing eight recipe values migrate as explicitly legacy current per-serving records—not inferred verified ingredient calculations.
3. **Canonical food identity:** re-scout the completed Pantry slice. Prefer attaching nutrition records to its reusable product identity when semantics fit, and keep physical batches as availability only. Add a separate canonical food identity only if Pantry products cannot represent generic ingredients and prepared foods without duplication.
4. **Authorization:** do not key sensitive privacy solely to the switchable profile cookie. Before exposing detailed diary data, add a local Nutrition access principal/session/credential seam (for example, salted local access code with signed HttpOnly authorization session), then model owner/guardian/authorized viewer/anonymized comparison grants server-side. This needs a Judge privacy review.
5. **Versioning and snapshots:** recipe calculations are reproducible current-state records; confirmed intake snapshots nutrient values, recipe/source/calculation/portion context and goal version. Corrections append audit context rather than silently mutating history.
6. **UI and charts:** follow existing server-page + client-island patterns. Use concise semantic SVG plus accessible tables unless later evidence justifies a chart dependency. Every dataset preserves missing/incomplete status.
7. **Cross-feature boundaries:** planned, prepared, served/assigned, consumed, Pantry-deducted, and grocery-required states remain independent and transact only where an explicit combined command requires it.

## First Worker package

Objective: implement the reusable pure Nutrition calculation kernel and comprehensive unit tests without touching current schema, migrations, Pantry, recipe, planner, cooking, UI, docs, or other dirty files.

Allowed files:

- `src/lib/domain/nutrition.ts` (new)
- `tests/unit/nutrition.test.ts` (new)

The kernel must include:

- canonical nutrient definitions covering every nutrient category named in the brief, with stable code, name/aliases, category, canonical unit, precision, semantic default, upper-reference capability, concise-dashboard flag and display order;
- finite non-negative nutrient-vector validation, addition/scaling/rounding utilities, and explicit missing-vs-zero behavior;
- reliable supplied-energy priority with documented macro-derived estimated fallback and material inconsistency warning support;
- macro energy grams, calories and percentage-of-calculated-energy dataset;
- normalized recipe contribution aggregation with included/optional/excluded contributions, fractional amounts, yield/edible/drained/retention multipliers supplied explicitly, conservative confidence, per-nutrient and overall completeness, total/per-serving/per-100g/portion scaling, and no speculative conversion;
- target, range and limit evaluation with distinct status/remaining/above semantics;
- planned and consumed daily totals kept separate;
- calendar trend and rolling average datasets that represent missing days as `null`, never zero;
- normalized household comparison output filtered by explicit comparison visibility and expressed relative to each person's own goal/reference;
- tests for invalid/negative/non-finite values, missing values, all named formulas and semantics, incomplete data, optional/excluded ingredients, fractional servings, yield scaling, source energy priority, calorie inconsistency, trend missing days, rolling averages, and hidden comparison profiles.

## Verification

- `pnpm exec prettier --check src/lib/domain/nutrition.ts tests/unit/nutrition.test.ts`
- `pnpm exec eslint src/lib/domain/nutrition.ts tests/unit/nutrition.test.ts`
- `pnpm typecheck`
- `pnpm vitest run --project unit tests/unit/nutrition.test.ts`
- `git diff --check -- src/lib/domain/nutrition.ts tests/unit/nutrition.test.ts`

The repository-wide `pnpm format:check` is not a completion condition for this package because T002 proved it is already red across 88 files; this focused package must still be formatted and must not expand that failure.

## Stop conditions

- Any implementation need outside the two allowed new files.
- Need to import or modify unstable Pantry/schema/migration/recipe/planner/cooking/UI files.
- Ambiguity would cause medical/personalized target/reference values to be invented.
- Verification fails twice for a cause not fixable inside the allowed files.
- Any live provider call, credential, external data write, or paid action would be required.

## Next boundary

After the kernel passes, do not run a Judge merely for code style. Re-scout the Pantry goal/worktree state, then use a Judge for the migration/canonical food/reference-source architecture boundary because that package overlaps externally owned schema and determines historical compatibility. A separate Judge is required before sensitive authorization/profile routes become broadly accessible.
