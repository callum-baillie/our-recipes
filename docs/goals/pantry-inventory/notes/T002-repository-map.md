# T002: Pantry Repository Architecture Map

Task: `T002`
Kind: `scout`
Status: `current`

## Current Worktree and Baseline

- Checkout: `main` at `c1c3af3` (`v0.1.0-beta.11`, matching `origin/main`). The only dirty path before implementation is the new untracked `docs/goals/pantry-inventory/` control directory.
- `pnpm verify` stops at `pnpm format:check`: Prettier reports 95 unchanged checkout files, consistent with Windows line-ending noise. No formatting write was run and no unrelated file was changed.
- Independently current-green: `pnpm lint`; `pnpm typecheck`; `pnpm test` with 50 unit tests and 30 integration tests; `pnpm openapi:validate` (valid with eight pre-existing warnings); `pnpm build` (passes with one existing Turbopack whole-project trace warning from the backup route).
- Not run during this read-only map: E2E, a11y, release-quality, local database migration against a disposable file, Docker smoke, real iPhone Safari, Unraid, or backup/restore runtime. These remain oracle work, not inferred evidence.
- `.env.local` and `.api_keys` exist but were not read. No provider call or credential access occurred.

## Architecture and Data Flow

### Runtime and Layering

- `package.json`: Next 16 App Router, React 19, strict TypeScript, Drizzle ORM with `better-sqlite3`, Zod, Vitest, Playwright, plain app CSS/Tailwind processing, Lucide icons, React Hook Form, and no client state-management library.
- `src/app/**`: server-rendered pages call services directly for initial state. Client components use local React state plus `fetch` against versioned App Router APIs and `router.refresh()`/navigation for reconciliation.
- `src/lib/domain/**`: Zod input schemas and pure calculations.
- `src/lib/services/**`: server-only use cases and transactions; not coupled to HTTP.
- `src/lib/db/client.ts`: one process-local SQLite connection, WAL, foreign keys, committed migrations applied on first access. The app is a single trusted-household deployment, not multi-tenant SaaS.
- `src/lib/db/schema.ts` plus `drizzle/0000` through `0014` and `drizzle/meta/_journal.json`: additive ordered migration history. Applied SQL is immutable; the next schema change must be a new migration and journal entry generated through the repository's Drizzle workflow.

### Household, Actor, and Mutation Trust

- `households` has one setup row. Most shared domain tables do not carry `household_id`; household isolation is the physical deployment/database boundary.
- `profiles` are preferences and attribution markers, not accounts. `src/lib/actor-context.ts` validates an HMAC-signed HttpOnly profile cookie, falls back visibly to the first active profile, and exposes `ActorContext { profileId, source }` without claiming authorization.
- Pantry stock therefore should follow repository reality: one household-owned catalog/inventory inside the database, with created/updated actor profile IDs for audit. It must not invent per-profile secrecy or pretend the profile cookie protects another household.
- `src/lib/http.ts` requires an explicit exact-match `Origin` from the current request origin, `APP_ORIGIN`, or configured trusted origins. Mutation routes use this plus Zod parsing and service calls. Pantry mutations must reuse the exact helper and active ActorContext pattern.
- Recipe writes have optimistic `expectedRevision` conflict protection. Planning/list rows do not. Pantry batches need an explicit version or expected-updated-at contract because concurrent quantity changes cannot silently overwrite each other.

### Recipes and Ingredients

- `recipe_ingredient_groups` and `recipe_ingredients` are structured ordered rows, not one free-form line. Each ingredient has nullable positive numeric `quantity`, free-form bounded `unit`, required original `item`, and free-form `note`.
- There is no canonical ingredient/product table, alias system, variant/brand/category data, optional-ingredient flag, package definition, dietary/allergen metadata, or mapping seam.
- `src/lib/domain/recipe.ts`, `src/components/recipe-form.tsx`, and immutable `recipe_revisions.snapshot` make the current ingredient shape part of compatibility. The safest mapping is additive and nullable on each recipe ingredient (or a separate mapping table), leaving `item`, `unit`, `quantity`, and `note` untouched when unmapped or corrected.
- `src/lib/services/recipe-service.ts` materializes ingredient rows into detail responses and FTS. Library cards currently omit ingredient graphs, so pantry badges need a bounded server-side projection rather than N+1 `getRecipe` calls.
- Recipe library filters are URL/Zod/server-query based in `recipeLibraryQuerySchema` and `src/app/recipes/page.tsx`. Pantry-aware filters should extend that pattern.

### Quantities and Units

- `src/lib/domain/ingredient-scaling.ts` parses textual serving yields and scales quantities. It normalizes kitchen volume only among cup/tbsp/tsp, mass among g/kg, volume among ml/L, and imperial mass among oz/lb; unknown units are numerically scaled without conversion.
- There is no exported dimension-aware canonical unit registry, count/package semantics, or compatibility API. Pantry math needs one shared server-safe unit module that classifies count/mass/volume, normalizes aliases to base units, rejects incompatible dimensions, and leaves ingredient-specific weight/volume conversions unsupported.
- Exact numeric quantities are required for shortage math. Approximate and unknown Pantry states must be clearly non-numeric and cannot silently satisfy exact recipe demand.

### Meal Planning

- `meal_plan_entries` stores date, breakfast/lunch/dinner/snack slot, nullable recipe or free-form title, integer servings, note, and created/updated actor IDs.
- `src/lib/services/planning-service.ts` lists a date range, duplicates weeks, exports ICS, and deletes rows. There is no status for cooked/skipped/cancelled, no substitutions, adjustment overrides, reservations, allocations, or link from a cook session to a planned entry.
- Projected Pantry demand must aggregate each recipe-linked entry by date and serving multiplier. Free-form meals add no invented demand. If status is introduced, migration defaults must preserve every existing entry as active/planned.

### Grocery Lists

- `generateShoppingList` reads planned recipes, scales numeric ingredients, and aggregates only when lower-cased raw `unit|item|note` matches exactly. Null-quantity lines stay separate per source occurrence. It creates a new list every time; existing lists are independent editable snapshots.
- `shopping_list_items` stores one current quantity/unit/item/note, checked state, optional aisle, and JSON unique source recipe IDs. It does not store contributing meal IDs/dates/servings, automatic demand, pantry coverage, staple replenishment, manual extra, manual override, recalculation delta, ignore-Pantry, purchase state, or Pantry intake link.
- The current UI edits fields optimistically on blur and does not surface server failures consistently. It cannot explain shortage math or protect manual intent during recalculation.
- Pantry integration should extend the list model additively and preserve the independent-snapshot contract. Automatic recommendations need explicit components and an override field; a generated row's current quantity cannot remain both the calculation output and the user's manual truth.

### Cooking

- `cook_sessions` records recipe, profile, target servings, start, and completion. `completeCookSession` marks completion for that profile only.
- `src/components/cooking-mode.tsx` performs client display scaling, starts/completes sessions, and has no planned-meal context, inventory preview, confirmation, substitution, leftover, or atomic deduction.
- A Pantry-aware completion service must own one transaction covering batch reductions, inventory events, cook completion, optional planned-entry status/link, and recalculation inputs. The UI should submit an explicit reviewed deduction plan; it must not silently consume when Start/Finish is pressed.

### UI, Navigation, and Accessibility

- `src/components/app-header.tsx` owns desktop and mobile top-level navigation. Pantry belongs in the shared `primaryLinks` list.
- Pages use `recipe-page`, `library-heading`, `recipe-grid`, card/panel, button, form, empty-state, and responsive classes from `src/app/globals.css`. There is no broad component library under `components/ui`; reuse the existing primitives, Lucide, `DismissibleDetails`, `ToastProvider`, and form patterns.
- Responsive breakpoints, focus-visible treatments, reduced-motion handling, coarse-pointer sizing, print rules, semantic regions, accessible labels, and explicit alert/status roles already exist. Pantry must extend these rather than introducing a parallel design system.
- The PWA is intentionally read-only and limited to viewed recipe GET surfaces. Pantry writes and views should remain network-dependent unless a separately reviewed read-only caching policy is intentionally added; no offline mutation queue is allowed.

### Tests and Documentation

- Unit tests cover pure domain schemas/calculations in `tests/unit`; integration tests use isolated `:memory:` SQLite and service calls, with many cross-feature cases in `tests/integration/household-service.test.ts`.
- `tests/e2e/setup.spec.ts` is the long fresh-household acceptance flow, already covering cooking, meal planning, generated lists, aisles, PWA, and backup. Pantry's main workflow can extend this or use a focused Pantry spec invoked by the same preparation pattern.
- `tests/e2e/a11y.spec.ts` and `release-quality.spec.ts` cover Axe, responsive/color/print/performance matrices. Pantry needs focused mobile/desktop and a11y coverage without weakening existing suites.
- `docs/openapi.yaml`, `docs/api.md`, `docs/architecture.md`, `docs/data-model.md`, `docs/security.md`, `docs/testing.md`, an ADR, README/implementation status, and release checklist are the native documentation surfaces.

## Acceptance Gap Matrix

| Requested capability | Current support | Gap |
|---|---|---|
| Product definition vs physical batch | None | New canonical product, aliases/metadata/staples, future identifiers, batches, locations, constraints, indexes |
| Exact/count/mass/volume and approximate state | Partial recipe scaling only | Dimension registry, canonical base values, package/count fields, approximate enum and explicit unknown semantics |
| Locations and nesting | None | Add ordered/archivable storage types, optional parent, defaults, cycle/dependency safeguards |
| Batch actions/history/undo/FEFO | None | Transactional command service, version check, immutable events, reversible-event metadata, status transitions |
| Expiry/freshness | None | Separate date columns/precision, derived states, opened shelf-life projection, non-safety copy |
| Recipe mapping/availability | Raw structured text only | Nullable mapping, manual correction, variant rules, optional flag, batched coverage projection and filters |
| Multi-meal projected demand | Simple scaled generation | Canonical aggregation by scheduled order, allocation projection, status/substitution semantics, shortage explanation |
| Grocery recommendation/override | Independent editable snapshot | Calculation components, source meals, manual extra/override, ignore/exclusion controls, staple math, partial purchase/Pantry link |
| Confirmed cooking deduction/leftovers | Session completion only | Preview/confirmation, atomic FEFO events plus session/meal link, substitutions/skips, Pantry leftover intake |
| Barcode future seam | None | Separate product identifier table only; no UI/scanning |
| Notification future seam | No event/job framework | Inventory events provide source; document future query/event hooks only |
| Security/concurrency | Origin/Zod/Actor seam available | Reuse exactly; add batch optimistic versioning and transaction tests; do not claim profile authorization |
| Full acceptance evidence | Existing recipe/planner/list flow only | Focused Pantry unit/integration/E2E/a11y/responsive/migration/oracle proof |

## Largest Safe First-Slice Candidates

### Candidate A — Foundational Pantry vertical slice (recommended)

Deliver one real end-to-end Pantry capability: additive migration and schema for canonical products, aliases/identifiers, locations, batches, and events; dimension-aware unit/expiry primitives; transactional service for default locations, quick add, list/search/filter, and core quantity/status actions with optimistic versioning; validated trusted-origin APIs; top-level Pantry page with summary, filters, quick/detailed add, core actions, native loading/error/empty states; focused unit/integration tests; OpenAPI and architecture/data/security docs.

This is large but coherent and unlocks every integration. Judge should narrow optional product metadata and advanced split/combine/undo UI only if required to keep the first slice reversible, while ensuring the stored model supports them and at least one event-backed undo path is proven.

### Candidate B — Canonical recipe mapping and availability

After A: add nullable mapping/optional semantics while preserving recipe text/revisions; canonical coverage service; batched card/detail projections; serving-aware breakdown, compact badges, manual correction, filters, and focused tests. Do not include meal allocation yet except a stable coverage contract designed for it.

### Candidate C — Planner, grocery, and cooking integration

After A/B: add scheduled demand aggregation and optional planned status/link; explainable list recommendation components and preserved override; purchased-to-Pantry flow; reviewed FEFO cooking deductions plus linked events and leftovers; adversarial unit/variant/double-counting tests and end-to-end workflow.

## Ambiguities for Judge

- Scope of the first vertical slice: whether advanced split/combine/donation/undo UI belongs in Candidate A or a second inventory-operations slice. The storage and event model must support it either way.
- Whether to add `household_id` to new Pantry tables. Repository reality is one database per household with no such foreign key on recipes/plans/lists; adding it only to Pantry may create false multi-tenant semantics. Prefer singleton household ownership unless Judge finds a concrete isolation benefit.
- Whether planned meal status is necessary before recipe availability. It is required for full acceptance but can be introduced during cross-feature integration if foundational contracts do not depend on it.
- Product images are optional. Reusing the hardened local image pipeline is safer than a new upload surface, but it need not block the first functional slice if the nullable model seam is explicit and no unfinished control is shown.

## Receipt Summary

The repository supports a clean server-side Pantry extension but has no canonical ingredient/inventory layer. The most responsible first implementation is a foundational end-to-end Pantry slice using additive tables, immutable event history, optimistic batch versions, validated APIs, native UI, and focused tests. Recipe mapping and cross-feature calculations should follow at explicit review boundaries.
