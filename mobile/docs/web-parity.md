# Mobile web parity coverage

This is implementation coverage, not a claim that every web feature has a native equivalent or that the app has passed device acceptance testing.

| Area              | Native workflows added                                                                                                                                                                                                                                                                            |
| ----------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Recipes           | Personal rating/notes; classifications, tags, source, equipment, nutrition and photos; archive/trash restoration; revision restoration; ingredient-based calculation with substitutions, exclusions and preparation evidence; calculation history; PDF printing/sharing, JSON and Markdown export |
| Planner           | Recipe, food, custom, takeout and leftover entries; optimistic edits; adapted ingredient/method snapshots; swaps; status changes; recipe snapshot refresh; planned-snapshot cooking; shared day and meal-type defaults; PDF export                                                                |
| Nutrition diary   | Manual/product/recipe intake; correction reasons and revisions; copy entry/day, move, reassign, delete and restore; unknown versus zero nutrients; profile export                                                                                                                                 |
| Nutrition records | Product label records and revisions; full nutrient catalog; recipe calculations; prepared yield linked to planned meals; allocation state changes and consumption; versioned goals; manual weight and connected-scale import                                                                      |
| Pantry            | Consume, open, move, freeze, thaw, correct, split, combine, discard, donate, restore and undo; event history; location create/edit/nesting/archive/restore; inventory filtering/sorting; PDF export                                                                                               |
| Shopping          | Rename/notes/store assignment; duplicate/archive/restore/delete; item add/edit/remove/reorder; purchased quantity intake; partial purchases; store/aisle setup; shared list settings; PDF export                                                                                                  |
| UI/runtime        | Consistent form surfaces, errors and retries; deferred search and bounded choice rendering; focus-scoped keep-awake; scoped remote resources; native document adapters; optimistic revisions and operation keys where supported                                                                   |

## Additional parity controls

- Energy estimates use the existing server preview/apply workflow, display its reference and disclosure, require an explicit apply action, and select the exact goal version being superseded.
- All eleven web body-composition fields are available for measurement entry and history. Unknown values stay blank; invalid units, ranges and body-component weights are rejected.
- Recipe suggestions expose the same server explanations, confidence, completeness and Pantry uncertainties, with helpful/not-helpful/dismiss feedback and links to recipes and planning.
- Prepared yields can start from a planned meal or a completed cooking session with a selected matching calculation.
- Explore & export provides the web library's creator, collection, category, cuisine, tag, time, favorite, cooked, Pantry and nutrient filters, all sorting modes, pagination, and selection of up to 100 recipes for PDF/ZIP export.
- Persistent ingredient-to-product mapping supports optional ingredients, compatible variants, removal and an unmapped-only filter. These are distinct from per-calculation substitutions.
- Inventory can be grouped by location, category or expiry and honors the shared grouping default. Rendering is paged to avoid mounting the entire inventory.
- Photo uploads support descriptions; generated serving photos require explicit paid-action confirmation and the existing server credential gate. No paid generation was executed during development.

## Delivery boundaries

API-key, provider credential and task-administration screens are opened on the connected server from mobile Settings. Credentials are never copied into the mobile cache. These are server-hosted workflows, not native administration forms.

The new mobile read routes are `GET /api/v1/cook-sessions` and `GET /api/v1/nutrition/profiles/{profileId}/recommendations`. They use the existing authorization/household services and return `Cache-Control: no-store`. Deploy the matching web server changes alongside mobile; the earlier prepared-recipes GET `workspace` addition is also required.

This checklist covers the identified application workflow gaps. It does not certify pixel-for-pixel UI parity, provider connectivity, complete end-to-end equivalence, or device release readiness.

## Validation

Run in `mobile`:

```sh
npm run typecheck
npm run lint
npm test
npx expo export --platform ios --platform android --output-dir /tmp/bord-mobile-parity-export
```

Run from the repository root:

```sh
npx vitest run --project unit tests/unit/mobile-parity-contracts.test.ts tests/unit/mobile-cook-history-api.test.ts
npx vitest run --project integration tests/integration/nutrition-prepared-consumption-api.test.ts tests/integration/nutrition-recommendation-api.test.ts tests/integration/nutrition-energy-estimate-api.test.ts
```

Contract tests exercise actual web schemas against mobile planner and nutrient helpers, including decimal quantities, missing nutrients, optimistic timestamps and document options. Integration tests check prepared-yield capacity exposed through the existing GET route. Existing signed actor behavior and mutation origin checks remain unchanged.

No live AI/provider call is part of this validation. Native exports verify bundling, not camera, print/share dialogs, system permissions, keyboard behavior, accessibility, account switching or connected-scale operation. Those require signed-in device acceptance tests with a compatible server. No connected Android device or iOS simulator was available in this environment.

The repository-wide API coverage check currently reports unrelated uncovered handlers: `GET /account/automation`, `PATCH /account/automation`, and `GET /ai/actions/{actionId}`. The mobile additions are declared in the internal-route registry; the unrelated handlers were not changed for this work.
