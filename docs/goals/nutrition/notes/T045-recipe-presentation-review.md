# T045 normalized recipe presentation review

Approved T044 after a read-only audit.

- Normalized calculations expose explicit unavailable, current and stale states; recipe cards omit stale/unavailable values rather than presenting them as current.
- The detail panel labels normalized evidence independently from the legacy/imported nutrition columns, so neither legacy nor AI-derived values can masquerade as normalized calculations.
- Mapping restoration after recipe graph rewrites requires exact normalized group, item and occurrence identity. Renames do not receive guessed product mappings.
- A successful recipe edit remains successful if mapping restoration or recalculation is unavailable. Existing calculations become stale and a successful recalculation appends a new immutable revision.
- Existing intake continues to reference its original calculation and frozen nutrient/provenance snapshot; no calculation or intake history is rewritten.
- The T044 receipt records focused presentation, component, recipe calculation and edit API tests plus passing full lint, typecheck and test gates (166 unit and 79 integration tests). Rendered behavior remains deliberately unclaimed.

The next boundary is a read-only Scout map across meal planning, cooking, serving, Pantry deductions, leftovers, recipe calculations and nutrition allocations. It must keep planned, cooked, served, allocated, leftover, skipped and eaten states distinct, model an explicit unassigned-serving pool, preserve profile privacy and immutable intake, and identify current Pantry ownership before defining a Worker package.

The exact GoalBuddy Judge exceeded the single-wait limit and was interrupted. The PM performed the same read-only approval gate as permitted fallback.
