# T001: Pantry Plan Validation

Task: `T001`
Kind: `judge`
Status: `current`

## Decision

Approved as an existing-plan execution goal. The supplied brief is unusually complete about owner outcome, constraints, excluded work, process, acceptance criteria, and final reporting. It should be preserved as scope truth, then operationalized against repository evidence before any implementation scope is chosen. No owner clarification is required before the read-only repository map.

The plan must not be interpreted as permission for a broad redesign. The implementation path should reuse current models and seams wherever viable and advance through coherent vertical slices until the entire integrated outcome is proven.

## Risk and Acceptance Evidence Map

1. Architecture and compatibility: identify current schema, applied migration policy, recipe ingredient representation, unit semantics, household/auth boundaries, signed `ActorContext`, API/mutation patterns, state management, navigation, design system, and tests. Record concrete paths and symbols.
2. Data integrity: prove reusable product definitions are separate from stock batches; historical references survive archive/depletion; migrations preserve existing recipe, plan, and grocery rows; indexes support household/location/ingredient/expiry access; quantity and optimistic-concurrency invariants prevent silent overwrite and invalid negatives.
3. Inventory behavior: prove exact and approximate quantities, compatible conversions only, nested/custom locations, FEFO actions, atomic split/combine/consume/correct/move/freeze/thaw/discard/restore flows, event history, and practical undo.
4. Recipe behavior: prove original ingredient text survives unmapped and corrected mappings; variants and optional ingredients are not silently merged; availability scales with servings and remains compact on cards while details expose required, available, allocated, projected, and shortage values.
5. Planner and grocery behavior: prove projected demand aggregates every relevant planned meal without physical consumption or double allocation; skipped/cancelled/cooked semantics follow repository reality; explainable grocery math preserves manual overrides and separates recipe demand, pantry coverage, manual extras, and staple replenishment without double counting.
6. Cooking, purchases, and leftovers: prove user-confirmed FEFO deductions update inventory and linked audit history atomically; purchased grocery intake is explicit; partial purchases and leftovers retain provenance.
7. Security and trust: prove household isolation uses the app's actual access boundary, profiles remain convenience only, mutation inputs are validated, exact trusted-origin checks remain, and browser code never gains database/filesystem/credential access.
8. UX and quality: prove native navigation and components, responsive keyboard/screen-reader behavior, non-color-only states, loading/empty/error/recovery paths, practical approximate-entry workflows, migrations on a development database, focused tests, full repository gates, rendered end-to-end workflow, and honest environment limitations.

## Exact Scout Package

Objective: Map the current repository architecture and baseline evidence needed to implement the supplied Pantry plan without replacing working systems.

Inputs:

- `AGENTS.md`, `README.md`, `package.json`, lockfile, framework/config files.
- `src/`, `drizzle/`, `scripts/`, `tests/`, and `docs/` paths relevant to schema/migrations, auth/household/ActorContext, recipe ingredients/units, meal planner, grocery logic, API/server actions, navigation/components/styles, state/cache patterns, fixtures, and verification.
- Current `git status`, branch/worktree facts, and repository verify scripts.

Constraints:

- Read-only; do not edit repository or board files.
- Inspect the whole architecture surface named by the brief, but report only concrete Pantry-relevant paths, symbols, behavior, and gaps.
- Distinguish current behavior from proposed behavior. Do not invent a competing ingredient, authorization, unit, or state system.
- Record pre-existing dirty files and baseline failures without repairing them.
- Do not make live OpenAI calls or access/print credentials.

Expected output:

- Architecture and data-flow map with exact file paths and key symbols.
- Current data compatibility, security, and trusted-origin seams.
- Recipe ingredient and unit capabilities plus safe mapping/conversion boundaries.
- Meal-plan and grocery calculation inputs, outputs, state transitions, and extension points.
- Native UI/navigation/component/test patterns for a Pantry page and dialogs.
- Gate inventory: focused commands, full oracle commands, environment-dependent checks, and any observed pre-existing red state.
- Gap matrix against the supplied acceptance criteria.
- Two or three largest safe first vertical-slice candidates, each with likely file scope, verification, risks, and dependencies.

## Required Review Boundaries

- Architecture boundary after the Scout map: Judge selects the first slice and rejects plans that compete with working systems.
- Migration/data-integrity boundary before merging the foundational domain slice: review compatibility, household scope, ActorContext audit fields, transactions, constraints, indexes, concurrency, and rollback/recovery behavior.
- Cross-feature calculation boundary after recipe/planner/grocery primitives exist: review unit normalization, variant compatibility, optional ingredients, FEFO, demand ordering, shortage formula, staple double counting, and override preservation with adversarial examples.
- UX integration boundary after the Pantry and recipe/meal/grocery/cooking flows are connected: review accessibility, responsiveness, recovery, confirmation, and visual noise.
- Final boundary only after fresh full-oracle evidence: audit every acceptance criterion, migration and existing-data compatibility, the isolated-CRUD misfire, current dirty diff, and any unverified device/runtime claims.

## Board Receipt Snippet

```yaml
receipt:
  result: done
  decision: approved
  full_outcome_complete: false
  note: notes/T001-plan-validation.md
  rationale: "The detailed plan is safe to operationalize after a read-only repository map; implementation scope remains evidence-dependent."
```
