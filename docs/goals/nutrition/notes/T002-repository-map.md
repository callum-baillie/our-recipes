# T002 — Repository architecture and Nutrition gap map

Snapshot: 2026-07-18, branch `main`, HEAD `c1c3af3` (`v0.1.0-beta.11`). This was a read-only Scout package completed by PM fallback after the exact GoalBuddy Scout exceeded the single-wait limit. Product files were not edited by this task.

## Repository shape and runtime

- Next.js 16 App Router, React 19, strict TypeScript, custom CSS/component library, Drizzle ORM over `better-sqlite3`, Zod HTTP/domain validation, client `fetch` plus local component state and `router.refresh`, Vitest unit/integration projects, and Playwright Chromium E2E/accessibility/release suites.
- `src/app/layout.tsx` loads the one local household plus current signed-profile actor and renders `AppHeader`; `src/components/app-header.tsx` owns desktop/mobile primary navigation (`Recipebook`, `Planner`, `Lists`, `Collections`). There is no chart dependency in `package.json` and no current chart component system.
- `src/lib/db/client.ts` is server-only in practice, enables WAL and foreign keys, and auto-runs append-only Drizzle migrations. Migrations currently end at tracked `0014_extended_recipe_nutrition.sql`; another active goal is concurrently adding untracked `0015_pantry_inventory.sql` and a journal/schema entry.
- `src/lib/http.ts` implements exact trusted-origin matching. Mutating routes generally Zod-parse request data and reject untrusted origins. Services use synchronous Drizzle/SQLite transactions and server-generated UUIDs.

## Household, actor, and privacy seam

- The app has exactly one local `households` row. `profiles` have display name, color/avatar, units, temperature unit, locale, timezone, archive and timestamps, but no household FK, account, password, role, or credential.
- `src/lib/actor-context.ts` validates a signed HttpOnly profile cookie, then deliberately falls back to the first active profile. Its source comment and `docs/security.md` are explicit: profiles personalize attribution/history and are **not authentication or authorization**.
- Existing profile-private recipe preferences are row-filtered by selected profile ID, but anyone with household UI access can switch profiles. That is insufficient for the brief's default-private adult diaries and server-enforced authorized-viewer/guardian rules.
- Architecture must introduce a separate trusted Nutrition access principal/session/credential or an equivalent real authorization seam. Merely adding permission rows keyed to switchable convenience profiles would create privacy theatre and violate AGENTS.md.
- Existing data export is recipe/backup oriented and profile deletion is archive-only; there is no account-management export/deletion framework for sensitive Nutrition history.

## Current recipe, ingredient, serving, and nutrition model

- `recipes` stores eight nullable mutable per-serving values: calories, protein, carbohydrate, fat, saturated fat, fiber, sugar, and sodium. `0014_extended_recipe_nutrition.sql` added the last three. `docs/api.md` describes them as bounded user-entered values displayed/exported exactly as entered.
- The explicit `/api/v1/recipes/[recipeId]/nutrition/estimate` action can write all eight through the current recipe revision path after trusted origin, selected profile, literal confirmation, current revision, configured provider, rate limit, and no-raw-content AI audit. Deterministic test doubles cover it; this Nutrition goal must not make a live call without the user's paid-call approval.
- Nutrition values have no source ID/version/retrieval date, reference amount, verification flag, manual-edit history, calculation method/version, confidence, completeness, assumptions, nutrient definition FK, or distinction between supplied/estimated/calculated. AI confidence/warnings live only in the request result/audit path, not durable recipe nutrition rows.
- `recipeIngredients` are free-form quantity, unit, item, and note rows. There is no canonical ingredient/food model or ingredient nutrient record in tracked code.
- Recipe revisions are append-only JSON snapshots of the validated whole recipe payload, so existing manual per-serving nutrition can be recovered by recipe revision. There is no consumption snapshot or immutable historical nutrient/goal context.
- `parseServingCount` supports numeric text and fractions. `RecipeServingDetails` scales ingredient display only; per-serving Nutrition values do not change when the selected serving count changes, which is correct for a per-serving label but there is no total/per-100g/portion-weight calculation.
- `scaleIngredientMeasurement` converts within common mass, volume, and US mass families for display and never crosses volume to mass. A newly appearing Pantry `inventory-units.ts` adds compatible count/mass/volume normalization for the in-progress Pantry goal. Neither provides density or food-specific piece/volume conversions.
- No final cooked weight, serving weight, yield percentage, drained/edible portion, substitution, retained oil/sauce, cooked-food record, or retention-factor representation exists.

## Planner, grocery, cooking, and Pantry data flows

- `mealPlanEntries` store date, meal category, optional recipe/free-form title, **integer** household serving count, note, creator/editor, and timestamps. There is no status, per-person allocation, partial serving, substitution/exclusion, prepared instance, leftover count, expected yield, or idempotency key.
- Planner UI is a single client component and server projection. It creates, copies, removes, exports, and generates a list. Planned meals are not currently connected to nutrition.
- `generateShoppingList` scales each recipe's raw ingredient quantity by planned servings divided by a simple `parseFloat(recipe.servings)`, aggregates only exact lower-cased unit/item/note matches, and creates a new list transactionally. It does not normalize units, preserve manual overrides across regeneration, subtract Pantry, reserve stock, or model double allocation.
- `cookSessions` store recipe, selected profile, integer target servings, start, and completion. Completion is only a timestamp scoped to the same selected profile. There is no prepared recipe instance, actual recipe revision/ingredient snapshot, substitutions, final yield, Pantry deduction, serving allocation, consumption, leftovers, or immutable nutrition record. Cooking history means completed sessions, not eaten meals.
- The separate Pantry goal changed the worktree during this Scout. Current evidence is in-progress, externally owned schema/domain only: `0015_pantry_inventory.sql`, new `pantryProducts`, aliases, identifiers, locations, batches, inventory events, recipe-ingredient product mappings, plus `src/lib/domain/pantry.ts` and `inventory-units.ts`. At the final Scout refresh there was no Pantry service, API route, page, UI, or Pantry test file. Nutrition must re-scout this seam before schema integration and must not overwrite those concurrent edits.
- Pantry product rows already include dietary tags/allergens and reusable product identity, while physical batches are separate and carry stock/expiry/history. Nutrition should attach normalized food nutrition records to the reusable product/food identity, never to availability batches or event totals, while retaining recipe-ingredient mapping as the bridge.

## UI, state, and test conventions

- The visual language is custom semantic React plus `globals.css`; components favor accessible native forms, visible labels, loading/error/empty states, Lucide icons, server page data, and small client islands. Nutrition should follow that pattern and add a purpose-built accessible SVG/table chart layer unless a maintained dependency is intentionally introduced.
- Recipe library cards currently do not project nutrition fields; home `RecipeSummaryCard` also omits them. Recipe detail shows the eight per-serving values and allows explicit OpenAI estimate when incomplete.
- There is no global client state store or offline mutation queue. The PWA deliberately caches only GETs and does not queue writes. Offline diary creation would require a new stable-ID/conflict-aware sync design rather than reuse.
- Unit tests are pure Node domain tests. Integration tests use temporary SQLite databases, real migrations/services, deterministic provider doubles, and reset connections. E2E uses prepared `.test-data/e2e-data` with a Next dev server; accessibility uses Axe. No Nutrition page, chart, reference, goal, allocation, consumption, snapshot, privacy, or recommendation test exists.

## Current verification baseline

- `pnpm lint`: pass.
- `pnpm typecheck`: pass.
- `pnpm test:unit`: pass, 14 files / 50 tests.
- `pnpm test:integration`: pass, 9 files / 30 tests.
- `pnpm format:check`: fail before Nutrition implementation, reporting 88 files across broad tracked surfaces. The failure is not attributable to Nutrition and appears dominated by repository-wide line-ending/format drift; it must remain visible and be re-evaluated without mass-reformatting unrelated user work.
- Build, OpenAPI, E2E, accessibility, database migration, and Docker were not run during this read-only Scout. The goal oracle still requires applicable fresh evidence later.

## Dirty-worktree ownership and concurrency

- Pre-existing/externally owned edits include docs/API/data model/OpenAPI, recipe preference/reaction routes and UI, recipe service/domain/cooking changes, CSS/home/E2E/integration/unit changes, and untracked recipe reaction files.
- The Pantry board and its newly appearing `0015` migration/schema/domain files are also externally owned and actively changing.
- Nutrition control files are the only files owned by this goal so far. No implementation task may revert, normalize, stage, or claim unrelated changes. Any overlapping schema, migration-journal, recipe, cooking, card, planner, grocery, or documentation work must merge against the current worktree and re-check ownership immediately before editing.

## Capability gap map

All core brief capabilities beyond the eight manual/AI-estimated recipe fields and existing recipe revision snapshots are absent or incomplete:

1. **Canonical nutrients/references/sources:** absent.
2. **Canonical ingredient/product nutrition and provenance:** absent; Pantry reusable product identity is in progress.
3. **Ingredient-derived recipe totals, serving/weight/yield calculations, confidence/completeness:** absent.
4. **Nutrition profiles independent of auth, sensitive field explanations, privacy/permissions/guardian/viewer/anonymized comparison rules:** absent; existing profile seam is explicitly insufficient.
5. **Versioned goals, reference selection, manual/clinician override preservation and historical target context:** absent.
6. **Prepared instances, fractional allocation, unassigned servings, leftovers, cooking-vs-consumption separation, idempotency/conflicts:** absent.
7. **Consumption diary/items/snapshots/corrections/copy/repeat/quick entries/daily aggregates:** absent.
8. **Nutrition route/navigation/tabs, card filters, planner previews, Pantry/grocery suggestions, household normalized comparisons:** absent.
9. **Charts, table alternatives, trend/completeness datasets, missing-day semantics and weight trend:** absent.
10. **Deterministic data-quality-aware insights and recommendation feedback:** absent.
11. **Nutrition export/deletion, offline sync, performance caches/incremental invalidation:** absent.

## Ranked safe architecture/phase candidates

1. **Pure Nutrition domain kernel while Pantry schema work is concurrent:** new domain modules and focused unit tests only, covering canonical nutrient identifiers/units, reference/goal semantics, safe mass/volume/count conversion boundaries, nutrient-vector arithmetic, energy fallback, recipe aggregation inputs, completeness/confidence, target/range/limit calculations, rolling averages/missing days, and chart datasets. This avoids schema overlap and creates a tested calculation contract.
2. **Normalized persistence and seed/reference provenance after Pantry migration stabilizes:** next append-only migration plus schema/services for sources, nutrient definitions, food nutrient records, calculation versions and recipe calculations. Attach Pantry product nutrition at the reusable-product level. Backfill existing eight recipe values as legacy per-serving source records without pretending they are ingredient-calculated.
3. **Real Nutrition authorization plus profiles/goals:** introduce a separate trusted access principal/session/credential, owner/guardian/viewer permission model, sensitive fields, manual goals and versioning. Judge must review privacy before broad routes/UI.
4. **Recipe calculation vertical slice:** map canonical food records to recipe ingredients/Pantry products, calculate total/per-serving/per-100g/portion values, persist calculation versions and completeness, surface concise recipe-card/detail data, and invalidate on recipe change.
5. **Planner/prepared/consumption vertical slice:** fractional per-person allocations, statuses, actual prepared instances, immutable snapshots, diary, daily totals, idempotency and explicit corrections; Pantry deduction stays independent from consumption.
6. **Nutrition UI, charts, household and cross-feature recommendations:** `/nutrition`, focused views, accessible chart/table layer, normalized permission-filtered comparison, recipe/planner/Pantry/grocery integration, and deterministic sufficient-data insights.
7. **Full oracle and documentation:** fresh migration, all four workflows, full gates, performance/concurrency/accessibility/privacy/historical audits, source attributions, extension points, and final report.

## Ambiguities requiring Judge resolution

- A server-enforced private diary cannot be built on the switchable profile cookie. Approve a real local Nutrition credential/session design before sensitive persistence is exposed.
- Decide whether `pantryProducts` becomes the shared canonical food/product identity or whether a distinct food identity sits above it; do not duplicate once Pantry semantics stabilize.
- Existing recipe nutrition is documented as per serving but lacks durable provenance; migration/backfill must label it legacy/manual-or-estimated unknown rather than infer a trusted source.
- No chart library exists. Prefer a small accessible server-dataset + semantic SVG/table layer unless maintenance/accessibility evidence justifies a dependency.
- The global format gate is already red. Future Worker receipts must use focused Prettier checks and keep the pre-existing broad failure visible until a separately authorized normalization package exists.
