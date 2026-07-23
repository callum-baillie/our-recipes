# T041 intake repair review

## Decision: approved

The confirmed bypass is closed. The generic route now reaches a service-level browser policy that rejects consumed/corrected recipe and product snapshots. The real-calculation regression copies the valid calculation ID, source/version/digest, and submits attacker-chosen nutrients/quality; it receives 400. The dedicated recipe route still loads and scales the calculation on the server. Correction series now preserve source type, so relabeling recipe history as manual cannot evade the route boundary. Explicit manual, skipped, deleted, latest-only, authorization, and immutable-history behavior remain intact.

Focused lint/format/diff, types, six repair tests, and full 161-unit/77-integration suites pass. Checkout-wide lint currently fails only in `src/components/shopping-list-editor.tsx`, an active Pantry T019 file, for React ref access during render. This is an external shared-checkout gate and must be rerun after Pantry settles; it is not permission for Nutrition to edit the file.

The largest safe next package is a private Food Diary product/manual/correction vertical slice. It should create server-built product snapshots from a selected immutable food record and evidence-backed quantity conversion, create explicitly labeled manual snapshots with server-owned source/quality semantics, extend the existing recipe server path for portion corrections, allow audited deletion, and expose accessible create/correct/delete controls for latest entries. All later revisions must supersede only the latest entry, preserve source type, and never accept product/recipe nutrient or provenance totals from the browser.

The exact GoalBuddy Judge exceeded the single-wait limit. The PM performed the same read-only approval gate as permitted fallback.
