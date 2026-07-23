# T001 — Nutrition plan validation

## Decision

Approved for continuous execution as an existing, detailed plan. The plan is internally coherent and supplies a strong full-outcome oracle, but implementation scope must remain repository-evidence-dependent. The exact GoalBuddy Judge agent was attempted first and failed because its selected model was at capacity; the PM completed this read-only fallback as allowed by the execution contract.

## Acceptance evidence map

- **Architecture and compatibility:** a Scout map must identify existing household/authentication, signed ActorContext, profile, recipe/ingredient, serving/scaling, unit, planner, grocery, Pantry, API/action, state, design, chart, migration, and test seams before a schema or route is selected.
- **Data and migration integrity:** new normalized definitions, source records, versions, goals, calculations, allocations, consumption, and snapshots must extend applied migrations and preserve existing records. A clean development database migration plus compatibility coverage is required.
- **Authorization and privacy:** tests must prove profile ownership/guardianship/explicit viewing, private diary protection, anonymized comparison behavior, hidden-profile exclusion, server-side enforcement, and no leakage through broad household queries. Existing convenience profiles cannot be reused as an authorization boundary without a separate trusted seam.
- **Calculation correctness:** focused tests must prove nutrient normalization, supported and rejected conversions, recipe totals and scaling, yields/weights, optional ingredients and substitutions, reliable-energy priority and estimated fallback, source conflict priority, target/range/limit semantics, rolling averages with missing days, completeness, timezones, partial and unassigned servings, leftovers, and planned versus consumed separation.
- **Historical correctness:** editing recipes, ingredients, calculations, sources, references, or goals must not mutate historical intake or historical target context. Explicit correction paths must remain auditable.
- **Cross-feature integration:** rendered and integration evidence must cover recipe cards, planner allocations, prepared/cooked state, consumption confirmation, Food Diary, Pantry availability/deduction separation, groceries, recipe suggestions, and normalized household comparisons. Pantry behavior must follow present code evidence, not the intent of a separate active board.
- **Reference and data quality:** authoritative reference rows require source/version/effective-date/jurisdiction attribution. General FDA Daily Values must not be presented as personalized goals. Missing sensitive fields must still allow manual goals. Incomplete data must suppress confident micronutrient recommendations.
- **UX and accessibility:** rendered evidence must show the focused Nutrition information hierarchy, concise responsive Overview, fast logging/allocation, neutral language, source/confidence/completeness, accessible keyboard/tooltips/table alternatives, non-color status, and relevant empty/incomplete states.
- **Performance and concurrency:** evidence must cover snapshot-based history, appropriate indexes/caching/invalidation, idempotent retry-sensitive operations, and conflict handling without treating caches as historical source of truth.
- **Final oracle:** the four supplied end-to-end workflows and all applicable repository gates must pass. Docker, PWA, backup, Unraid, real-device, external-provider, or current-reference claims remain unproven unless directly exercised.

## Required Scout package

Use T002 exactly as written in `state.yaml`. It is a single read-only repository map that must report concrete files, symbols, data flows, present-vs-absent Pantry evidence, dirty-state ownership, current verification commands/baseline, and ranked safe vertical-slice candidates. It must not generate a generic redesign or edit files.

## Required Judge boundaries

1. Architecture and first-slice approval after T002.
2. Migration, canonical-data, source-priority, and historical-integrity review before dependent feature expansion.
3. Sensitive profile permission and household privacy review before broad UI/API exposure.
4. Meal allocation, consumption snapshot, Pantry/grocery separation, idempotency, and concurrency review at the cross-feature boundary.
5. UX, charts, accessibility, deterministic recommendation, and data-quality review once the integrated views render.
6. Final full-oracle audit after fresh migration, all four workflows, complete quality gates, and current dirty-diff review.

## Parallel safety

The next package is one read-only architecture Scout. Parallel write work is unsafe because schema/API/UI file ownership and the active Pantry board's code state are not yet known.
