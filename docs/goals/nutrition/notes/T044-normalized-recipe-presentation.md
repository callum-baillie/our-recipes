# T044 normalized recipe presentation and recalculation

Integrated normalized recipe Nutrition into the existing recipe experience while preserving every legacy, Pantry, reaction, actor, origin, and revision seam.

- A pure presentation model distinguishes unavailable, current, and stale calculations and derives concise whole-recipe/per-serving calories, protein, fiber, and sodium with source, method, confidence, completeness, warnings, and calculation/recipe revision context.
- Recipe detail now renders a dedicated normalized ingredient-calculation panel. Missing values are explicitly unknown. Stale calculations remain visible as history with a recalculation warning. The older recipe columns are relabeled `LEGACY / IMPORTED` and remain separate from normalized/AI values.
- Recipe library cards show concise per-serving normalized values and coverage only for calculations matching the current recipe revision. Stale/unavailable values do not appear current.
- Recipe edits capture structured ingredient-to-product mappings before the existing graph rewrite and restore them only across exact normalized group/item/occurrence matches. Quantity, unit, serving, and ordering changes with the same ingredient identity can retain evidence; renamed ingredients require review. No fuzzy product remapping is invented.
- After a successful edit, recipes with a prior normalized calculation append a new calculation for the new revision. Mapping restoration or recalculation failure never rolls back or returns failure for the already-committed recipe edit; the response reports unavailable and the old calculation remains stale. Recipes without a prior normalized calculation are not auto-created.
- Existing consumed entries retain their original calculation IDs and values; the recalculation integration only appends new calculation revisions.

Focused evidence: 4 unit tests and 3 integration tests pass for current/stale/unavailable presentation, concise filtering, accessible copy, deterministic history, exact mapping restoration, ID churn, new recipe revision calculation, API edit success, and old calculation usability. Full `pnpm test` passes with 166 unit and 79 integration tests. Full lint, typecheck, focused Prettier, and scoped diff checks pass; CRLF notices are non-error workspace warnings.

The exact GoalBuddy Worker exceeded the single-wait limit. The PM completed the exact allowed-file package as permitted fallback.
