# RV07 / G06 — authoritative action reviews

Starting point: isolated `refinement/rv-completion`, `45ed512b2d4909dac78ceb096d985dab85387d24`. The original checkout was not edited. Evidence below concerns this working diff; final build/revision and browser evidence belong to the lead register.

## Implementation

**Status: implemented; focused behavioral checks verified; production browser and device review pending.**

- `ai-app-action-service.ts` now derives each review from the same authorized response used to compute its stale-approval hash. It persists only bounded presentation metadata and the existing guard hashes, not those additional source responses. Recipe identity no longer comes from a separate, unguarded display lookup.
- Shared versioned `shared/mobile-domain/app-action-review.ts` defines the web/native subject, effect, context, before/after changes and caveats. The server normalizer resolves actual meal/recipe/list/item/product/batch/person names. A proposal's model-written title is separate from target identity. Context includes meal date, human slot, servings, recipe revision, selected people, parent shopping list, recorded quantity/unit, batch location and Nutrition recipient/event state where applicable.
- Related recipe/product/location/store/aisle/tag/collection references are authorized reads with saved guards. Meal swaps review and guard both meals. List reorder reviews named items. Selected meal people come from authenticated profile reads; only selected name projections are retained and guarded. Cross-person diary commands review the authorized destination and recheck its raw-diary sharing at application. Nutrition food identity does not require unrelated Pantry-stock sharing; only the identity projection reaches the review.
- Web and native render the same review lines. Bodyless removals have no artificial `Value: Not set` row. Unknown quantity remains distinct from zero. Full submitted body details remain available in an optional disclosure for non-empty changes; those raw technical fields are not used as target identity. Requests exceeding the 60-change presentation boundary are rejected with a smaller-review recovery; labels/values are bounded with an explicit shortened marker. Missing identified removal targets are rejected instead of displaying a UUID as their name.
- Image actions say **Prepare an image preview** and explain that separate review/acceptance is required while existing photos stay unchanged. Image job/candidate lifecycle is owned by the lead implementation.
- Additive first-party response fields: single-meal GET includes configured `mealLabel`; kitchen-context response includes linked-person `subject.displayName`; authorized Nutrition intake/prepared GET responses include recipient `subject.displayName`. Their existing access checks remain in force. OpenAPI documents the shared metadata and compatibility semantics.

## Persistence and compatibility

No migration or applied-history edit. `review.schemaVersion: 1` is an additive field in existing decision `evidenceJson`. Older records still load. A pending non-image proposal lacking current review metadata must be prepared again before applying; the UI explains the missing target detail and disables its Apply action, and the server enforces the same409. Existing completed-result replay is returned before this guard, and old image proposals retain their prior compatibility behavior. Existing decision versions, expiry, execution locks, dependencies, actual handlers and uncertain-outcome recovery remain in place.

## Executed checks

All checks used synthetic local data and deterministic inputs, with no live provider calls.

| Command                                                                                                                                  | Result / demonstrated behavior                                                                                                                                                                                                                                                    |
| ---------------------------------------------------------------------------------------------------------------------------------------- | --------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `pnpm exec vitest run --project integration tests/integration/rv-action-review.test.ts tests/integration/ai-operation-contracts.test.ts` | 16 passed at the earlier focused checkpoint: named meal identity/context from real authorized handlers; stale deletion409; fresh removal preserves Nutrition history through cancellation; linked-person kitchen context; existing dependency, sharing and action-contract cases. |
| `pnpm exec vitest run --project integration tests/integration/rv-action-review.test.ts`                                                  | 3 passed; adds old-proposal loading plus mandatory fresh review.                                                                                                                                                                                                                  |
| `pnpm exec vitest run --project unit tests/unit/rv-action-review.test.ts tests/unit/ai-app-action-card.test.ts`                          | 7 passed: mounted named bodyless review, quantity unknown/zero, parent list, batch location/amount, bounded labels, image acceptance wording, named swaps/reorder and shared lines.                                                                                               |
| `pnpm --dir mobile exec vitest run tests/rv-action-review.test.ts`                                                                       | 1 passed under the native package's test configuration. Verifies shared review lines and absence of a fabricated bodyless value; this is not a device-rendering test.                                                                                                             |
| Targeted `pnpm exec eslint` on the changed service, domain, web card, route and test files                                               | Passed; the last run had one unused fixture destructuring warning, subsequently removed.                                                                                                                                                                                          |

The first integration iterations exposed a wrong preferences-property name (corrected from `mealPlans` to `mealPlan`) and a test assumption that removal physically deletes meals. The correct acceptance now asserts cancellation where Nutrition allocation history must be retained. These failed iterations are not counted as passes.

## Prepared browser acceptance and remaining evidence

`tests/e2e/rv-action-review.spec.ts` is included by the lead in the production browser runner. It supplies the same normalized named-meal review with controlled action409, checks visible identity/date/meal/servings, no raw UUID/empty-value rows, keyboard activation, and overflow at1440×1000,390×844 and320×568 with200% text. It writes revision-labelled captures under `screenshots/rv-completion/action-review/`. Its mocked409 checks UI recovery; the integration test above establishes actual handler/database stale rejection. **No browser pass or screenshots are claimed until this runner executes.** Browser plugin was unavailable; the existing Playwright harness is used.

Native device/screen-reader behavior remains unexecuted here. The lead owns native type/build and integrated gates. No deployment, real household mutation, paid generation, backup or recovery operation was performed by this workstream.

## Actual shopping-row follow-up

The final integration pass caught a normalization gap: persisted shopping rows
use `item`, while an earlier helper fixture supplied `name`. Replacing the fixture
with the real response shape reproduced five failures before correction. Reviews
now identify the real item, resolve an existing catalog match through `body.itemId`,
and keep Amount to buy separate from Cart amount. A cart change shows its own
quantity/unit before and after, including zero and unknown units; demand units
are never substituted.

On Vitest4.1.12, the helper suite passed7/7 and the real authenticated
prepare/apply suite passed4/4. The added case creates Chopped tomatoes and Bread,
reviews333g to buy versus2can in cart, asserts preview performs no mutation,
then applies deletion and verifies only Bread remains. Targeted lint passed.
