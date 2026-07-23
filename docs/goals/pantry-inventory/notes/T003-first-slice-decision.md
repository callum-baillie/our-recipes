# T003: First Pantry Slice Decision

Task: `T003`
Kind: `judge`
Status: `current`

## Decision

Approved: implement the foundational Pantry vertical slice before recipe/planner/grocery/cooking integration.

The slice must produce working household inventory behavior, not schema-only scaffolding: additive tables and migration, dimension-safe unit primitives, validated transactional services, optimistic batch concurrency, event history and one practical undo path, trusted-origin APIs, a top-level responsive Pantry page, navigation, focused tests, and native documentation. It establishes the canonical product and optional recipe-mapping seams required by later phases while leaving every existing ingredient line and applied migration untouched.

Explicitly deferred to subsequent required slices—not removed from the goal—are recipe availability UI, planned-demand allocation, explainable grocery recommendations/overrides, purchased-item intake, confirmed cooking deductions, leftovers, advanced split/combine UX, product-image upload, and the final end-to-end flow.

## Architecture Decisions for This Slice

- Follow the one-database-per-household architecture. New shared Pantry rows are household-owned by deployment; actor profile IDs provide attribution only. Do not add a Pantry-only pseudo-multitenant authorization model.
- Preserve `recipe_ingredients` unchanged. Add a separate optional recipe-ingredient mapping table so original structured text and immutable recipe snapshots remain compatible.
- Model products, aliases, multiple future identifiers, locations, batches, and immutable events separately.
- Store exact quantities in the entered compatible unit and expose dimension-aware normalization for calculations; represent approximate/unknown states explicitly and never use them as exact coverage.
- Use a monotonic batch `version` checked by every mutable action. Compound changes and event creation must share one SQLite transaction.
- Seed sensible default locations lazily/idempotently after setup so existing databases migrate without synthetic actor or household data.
- Provide core actions now: add/edit, consume amount/one, mark empty, open, move, freeze, thaw, correct, discard, donate, restore, and undo the most recent reversible action. Advanced split/combine may follow after the data-integrity review.
- Product image metadata may be nullable with no unfinished upload control in this slice.

## Required Boundary Review

After the Worker package, run a read-only migration/data-integrity Judge review covering migration compatibility, constraints/indexes, default seeding, actor attribution, batch versions, transactions, FEFO selection, event/undo fidelity, exact versus approximate units, archive/history behavior, trusted-origin validation, and the rendered Pantry workflow. Rejected findings become a bounded repair task before recipe integration.

## PM Concurrency Adjustment

After activation, a separate user-owned task introduced recipe-reaction changes including `src/app/globals.css`. T004 had not begun editing. To avoid overlap, PM replaced that allowed path with `src/components/pantry-manager.module.css`; all other Worker scope and proof remain unchanged. The concurrent recipe/nutrition changes must be preserved and are outside T004.

## Receipt Summary

The package is the largest reversible slice that provides real user-visible inventory while isolating the highest-risk cross-feature math for the next reviewed phase.
