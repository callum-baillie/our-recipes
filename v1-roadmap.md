# V1 public release roadmap

Last audited: 2026-07-21

## Release recommendation

The repository is now a v1 release candidate: every P0 and P1 implementation item in this roadmap is resolved, the integrated production-browser oracle passes, and the release artifact denylist is clean. Public release is still intentionally held on target-specific evidence that cannot be produced in this workspace:

1. Build and inspect the real non-root Docker image; the local Docker service is stopped and this Windows token cannot start it.
2. Run the supported Unraid deployment with mounted storage and direct persistence/upgrade/restore evidence.
3. Complete real iPhone Safari acceptance for import selection/conversion, safe areas, keyboard behavior, and offline reading.

For v1, "public release" should mean a publicly downloadable, self-hosted app for a trusted household network. It should not imply safe public-internet exposure. Profiles remain convenience selectors, not accounts or access control. Internet-facing deployment requires a separate authentication, authorization, session, rate-limit, and threat-model milestone.

## Audit evidence and boundaries

This roadmap is based on:

- Repository review of pages, 163 versioned API method handlers, database schema/migrations, service boundaries, tests, release documentation, Docker packaging, and the current worktree.
- Cross-feature tracing across Recipes, Meal Plans, Pantry, Lists, Nutrition, Cooking, profiles, and AI actions.
- Fresh desktop and 390 px mobile browser review of onboarding, recipe creation/library/detail, Pantry, Planner, Lists, and Nutrition. The sampled pages had no browser console errors, and the visual language was consistent overall.
- Passing formatting, zero-warning lint, type checking, 266 unit tests, 198 integration tests (9 skipped), fresh migration/database integrity, representative beta upgrade plus restored upgraded backup, and the production release build.
- Passing OpenAPI validation with zero warnings, route coverage for 104 public operations plus 59 explicitly internal/retired operations, and generated-client smoke coverage.
- Passing `pnpm test:v1-release`: 12 isolated production-standalone browser tests plus 3 performance checks, covering the full Recipe -> Planner -> Pantry-aware List -> purchase -> Cook -> prepared Nutrition -> explicit consumption loop.
- A clean standalone denylist scan of 2,820 files after the final production build. No household databases, backups, media, credentials, source, tests, or internal roadmap content were found.

This audit proved the automated read-only PWA journey and a real upgraded-backup restore. It did not prove a current Docker image, Unraid deployment, or real mobile Safari device; those remain explicit release-candidate gates. No live paid provider call was made.

## Priority definitions

- **P0 — release blocker:** can lose or disclose data, create materially inconsistent state, or leave the v1 claim unproven.
- **P1 — v1 product requirement:** important workflow, trust, or usability gap that should be complete before general release.
- **P2 — release hardening:** polish, scale, documentation, or operational work that should be closed for the release candidate unless consciously deferred.

## P0 release blockers

### V1-001 — Make every recipe mutation integration-safe

**Implementation status:** Resolved for the v1 candidate. UI, lifecycle, tag, revision-restore, estimator, and AI updates use the shared command; mapping/recalculation outcomes are returned visibly and regression-covered.

**Problem:** `updateRecipe` rebuilds ingredient groups and ingredients by deleting and recreating them. Pantry mappings are keyed to ingredient IDs and cascade on deletion. The normal recipe `PUT` route attempts to capture and restore mappings, but capture/restore failures are swallowed and the save can still succeed. Tag changes, lifecycle changes, revision restore, AI Nutrition estimation, and AI recipe updates call `updateRecipe` directly and bypass that orchestration entirely.

**Impact:** attaching a tag, archiving a recipe, restoring a revision, accepting an AI update, or estimating legacy Nutrition can silently remove Pantry mappings. Pantry availability and grocery demand then become unknown, while a prior normalized Nutrition calculation can remain visible but stale.

**Required work:**

- Introduce one server-side recipe mutation command used by edit, tag, status, restore, AI update, and estimator paths.
- Keep the recipe graph update, mapping remap, normalized Nutrition recalculation/invalidation, revision write, and search index update in one transaction.
- Preserve mappings by stable ingredient identity where possible. If an ingredient materially changes, produce an explicit mapping-review result instead of silently dropping it.
- Do not swallow capture, restore, or recalculation failures. Roll back or return a visible partial-review state.
- Use targeted mutations for tags and lifecycle state when a graph rebuild is unnecessary.
- Add regression tests for mapped recipes through edit, tag attach/remove, archive/restore, revision restore, AI update, and legacy Nutrition estimate.

**Acceptance:** every mutation either preserves mappings and recalculates Nutrition, or refuses/flags the change before the user leaves the flow. No successful response can hide an unavailable mapping restore.

### V1-002 — Stop household data from entering standalone artifacts

**Implementation status:** Standalone artifact protections are implemented and the populated local artifact denylist passes. Current container-layer evidence is pending because the Docker Desktop service is stopped and cannot be started by this Windows token.

**Problem:** the current `.next/standalone` output contains databases, WAL/SHM files, backups, imported media, and recipe images. The backup route's NFT manifest traced 959 files, including 21 data paths and 97 test paths. The build itself warns that the whole project was traced unintentionally.

The Docker build context excludes `data`, `.test-data`, `.env*`, and `.api_keys`, which reduces Docker-image risk, but it does not make the standalone output safe or prove the final image layers are clean.

**Required work:**

- Constrain output-file tracing around backup/filesystem services and remove dynamic project-root traversal from the traced dependency graph.
- Add an artifact allow/deny test for both `.next/standalone` and the built container image.
- Fail the release build if it contains `DATA_DIR`, databases, WAL/SHM files, backups, imported media, `.env*`, `.api_keys`, `.git`, tests, coverage, or unrelated repository source.
- Confirm runtime-created data remains on the mounted persistent volume and is never copied into the immutable application layer.
- Document the supported standalone/Docker build path so local packaging cannot accidentally publish household content.

**Acceptance:** a clean and a populated fixture produce identical application-layer file manifests, except for intended build metadata. A release reviewer can prove no household or secret material exists in the artifact or image history.

### V1-003 — Establish one integrated v1 release oracle

**Implementation status:** Resolved as `pnpm test:v1-release`, required by CI, and passing against isolated production standalone servers.

**Problem:** `pnpm test:e2e` runs only `tests/e2e/setup.spec.ts`. CI runs that, the older accessibility suite, and build checks, but it does not run `release-quality.spec.ts`, the Pantry browser specs, or a complete Nutrition workflow. Newer feature tests exist but are not release-gating. There is no single browser journey that proves the full household loop.

**Required work:**

- Create a `test:v1-release` command and make it required in CI and release documentation.
- Include the existing Pantry specs, release-quality matrix, and focused Nutrition browser coverage.
- Add a deterministic integrated journey:
  recipe -> Pantry mapping -> meal plan -> missing-items list -> purchase intake -> Pantry -> cook -> leftovers/prepared Nutrition -> explicit consumption.
- Exercise both regular UI commands and AI-confirmed commands with deterministic provider mocks.
- Run desktop, 390 px mobile, keyboard, reduced-motion, light/dark, and axe checks on the critical routes.
- Keep fixture data isolated and assert no live network/provider access.

**Acceptance:** one command proves the supported v1 loop, passes in CI from a fresh checkout, and produces a compact evidence bundle for a release candidate.

### V1-004 — Publish a truthful release contract and upgrade path

**Implementation status:** Resolved for the candidate through the capability matrix, release checklist/notes, support policy, current backup metadata, rollback guidance, and a passing representative last-beta migration plus upgraded-backup restore test.

**Problem:** README, security, implementation-status, API, and release-checklist documents describe different generations of the app. Some still say Nutrition is only user-entered and that no estimator/provider path exists, while the current UI has normalized calculations, AI estimation, Pantry, Nutrition, onboarding, settings, and assistant workflows. The old release checklist can appear complete without covering these newer domains.

**Required work:**

- Define the v1 support boundary: trusted-network self-hosting, supported browsers, storage/backup expectations, AI optionality, and non-medical Nutrition language.
- Replace overlapping status claims with one capability matrix linked from the README.
- Publish install, upgrade, rollback, backup, restore, data-location, and troubleshooting instructions.
- Prove an upgrade from the last public beta data shape through all migrations without loss, plus restore into a fresh v1 instance.
- Clearly state that profiles are not private accounts. Use "profile-scoped" instead of "private" where access is not actually enforced.
- If public-internet exposure is desired, hold v1 until real authentication and authorization are implemented and reviewed.

**Acceptance:** documentation matches the shipped UI/API, a beta backup upgrades and restores successfully, and the release checklist cannot be completed without the new integrated oracle.

## P1 cross-feature product work

### V1-101 — Use one command layer for UI and AI actions

**Implementation status:** Resolved with shared recipe and Nutrition-aware Planner commands plus UI/AI parity coverage.

Regular meal-plan creation uses `addMealPlanEntryWithNutrition`, but the AI assistant calls `addMealPlanEntry` and `updateMealPlanEntry` directly. AI recipe updates also bypass recipe mapping/Nutrition orchestration.

- Route UI, API, and AI confirmations through the same application commands.
- Reconcile automatic single-profile Nutrition allocation on AI add/edit/remove.
- Return the same validation, audit, conflict, and integration result shape from every initiator.
- Add parity tests showing that equivalent UI and AI actions create equivalent state.

### V1-102 — Pin or explicitly refresh planned recipe revisions

**Implementation status:** Resolved with additive title, revision, normalized-calculation, and full Pantry ingredient snapshots; later recipe changes require explicit refresh before changing planned demand.

Meal-plan entries store a recipe ID and servings, but not the planned recipe revision or Nutrition calculation. Pantry demand and Nutrition projections read the current recipe graph/calculation. Editing a recipe after planning can silently change an existing week's quantities and nutrient projection.

- Prefer pinning the recipe revision and normalized calculation used when the meal was planned.
- Alternatively, display "recipe changed since planning" and require an explicit refresh.
- Ensure grocery regeneration states which plan/revision it used.
- Preserve historical plan intent in exports, duplication, and completed meals.

### V1-103 — Connect cooking completion to prepared Nutrition

**Implementation status:** Resolved with an explicit, retry-idempotent prepared-batch step linked to cook session, plan, calculation, and actual servings. It does not mark food eaten and links to explicit portion review.

Cooking completion correctly performs explicit Pantry deductions, creates leftovers, and marks the cook session complete. Prepared Nutrition is a separate manual flow even though it can store a `cookSessionId`.

- After cooking, offer an explicit "Create prepared Nutrition batch" step with actual servings and optional final weight.
- Link the prepared snapshot to the cook session, meal-plan entry, recipe revision, and normalized calculation.
- Carry planned allocations forward for review without marking anything eaten.
- Keep Pantry stock, cooked food, served portions, and consumed food as separate states.
- Support undo/correction rules across Pantry deductions, leftovers, prepared batches, allocations, and diary entries.

### V1-104 — Replace the two competing shopping-list generators

**Implementation status:** Resolved with one Pantry-aware primary Planner action, durable week/mode identity, regeneration preservation, and manual/create/rename/archive/restore/duplicate/delete lifecycle controls.

The Planner currently offers:

- "Generate shopping list," which copies all recipe ingredients without Pantry subtraction.
- "Make missing-items list," which uses Pantry-aware projected shortages.

These can create different lists for the same week. The Pantry generator remembers its list ID only in component state, so a reload can create another list. Lists then accumulate because they cannot be renamed, archived, or deleted.

- Present one grocery action with an explicit mode: all planned ingredients or missing items after Pantry.
- Persist a durable source identity such as household + week + mode, and regenerate the same list without losing manual edits.
- Show covered, short, unknown, manually added, and manually protected rows consistently.
- Add list rename, archive, delete, duplicate, and manual-create controls.
- Disable generation when there is no demand and explain unknown/unmapped ingredients before creating a list.
- Let the Lists page start a manual list without first visiting Planner.

### V1-105 — Preserve Pantry product identity from Nutrition recommendations

**Implementation status:** Resolved with product-linked provenance, idempotent recommendation reuse, compatible-row merging, and a focused integration test.

Nutrition recommendations know the Pantry `productId`, quantity, and unit, but the UI posts a plain text shopping item and drops the product link/provenance.

- Upsert or merge a product-linked row into the selected Pantry-aware list.
- Preserve recommendation, recipe, product, quantity, unit, and actor provenance.
- Avoid duplicating an existing shortage row.
- Make purchased-item intake work without asking the user to select the product again.

### V1-106 — Choose one authoritative recipe Nutrition model

**Implementation status:** Resolved. Normalized versioned calculations drive presentation/filtering/planning; legacy/imported/AI values are labelled optional source evidence.

Recipe detail currently presents both "Calculated recipe nutrition" and "Stored recipe nutrition fields." The latter can be AI-estimated and updated separately from normalized ingredient evidence. Search/sort and users can encounter conflicting numbers.

- Make normalized, versioned ingredient calculation the default source of truth.
- Treat imported/manual legacy fields as clearly labelled source evidence or a migration input, not a parallel truth.
- Label estimated, partial, stale, and verified values consistently across cards, detail, Planner, and diary.
- Prevent filters/sorts from silently mixing legacy and normalized values.
- Recalculate or invalidate when recipe ingredients, mappings, product nutrition, serving yield, or optional ingredients change.

### V1-107 — Centralize household-local dates and time zones

**Implementation status:** Resolved with one server-safe local-date utility used by Home, Planner, AI context, prepared defaults, and Nutrition, including offset/DST/week-start coverage.

Home and Planner use UTC `toISOString().slice(0, 10)` for calendar dates. Planner also passes `weekStart` as `today` to the Nutrition comparison. Around local midnight or DST boundaries, the home page, week selection, AI context, Pantry prepared dates, and Nutrition can disagree.

- Add one server-safe local-date utility driven by the active profile/household time zone.
- Use it for home, Planner, AI context, prepared/expiry defaults, and Nutrition.
- In Planner, compare actual local today or clearly label a selected date; never call the week start "today."
- Add tests for negative/positive offsets, DST transitions, Sunday/Monday week starts, and browsing historical/future weeks.

### V1-108 — Scale Pantry-aware recipe discovery

**Implementation status:** Resolved with batched inputs, bounded 500-recipe pages, accurate filtered pagination, and 1,000/10,000-recipe time/memory regression gates.

The Pantry filter loads up to 10,000 recipes, calculates availability for each recipe with repeated recipe, stock, plan, and mapping queries, filters in memory, and replaces pagination with one page.

- Batch recipe ingredients, mappings, stock, and outstanding commitments.
- Filter/paginate in a bounded query or materialized availability index.
- Return an accurate total and preserve normal pagination.
- Add 1k/10k recipe performance and memory gates with Pantry filters enabled.

### V1-109 — Align profile-scoped language with the actual trust model

**Implementation status:** Resolved across current public UI/docs. Historical migration/decision records retain their original wording; retired credential/permission routes remain fail-closed and explicitly internal.

The onboarding warning is accurate: profiles are not passwords. Elsewhere, ratings, notes, diary visibility, and Nutrition documentation still use "private" language that can imply confidentiality.

- Audit every privacy claim and change it to "profile-scoped" or "personalized" unless access is enforced.
- Keep signed `ActorContext` attribution and household-profile linkage intact.
- Remove or clearly retire obsolete credential/permission routes and concepts from public API/docs while retaining migration history safely.
- Add a persistent trusted-network reminder in backup/export and deployment documentation.

### V1-110 — Improve primary-task hierarchy on recipe and Nutrition screens

**Implementation status:** Resolved: photo tools are collapsed below cooking content, Nutrition views wrap at mobile widths, the seven-day desktop grid fits, manual-list empty metadata is concise, and offline state is explicit. Desktop/tablet/mobile, print, dark-theme, overflow, keyboard, and Axe acceptance pass in the release oracle.

The visual design is cohesive, responsive, and generally accessible, but two sampled mobile issues should be fixed:

- Recipe detail puts a large photo upload/generation workspace before servings, ingredients, and method. Collapse media management behind "Add/manage photos" and keep the cooking content near the top.
- Nutrition's six-view tab row horizontally clips on 390 px screens with only a small scrollbar as an affordance. Use a mobile view menu, segmented wrap, or stronger overflow cue while preserving keyboard navigation.
- Review the Planner desktop grid at 1280 px; Sunday was outside the initially visible calendar area. Ensure all seven days are visible or provide an obvious, keyboard-accessible scroll affordance.
- Reduce repeated explanatory copy and oversized empty-state/card height so Pantry and Nutrition surface actionable content sooner on phones.

## P2 release hardening

### V1-201 — Complete and disambiguate OpenAPI

**Implementation status:** Resolved with zero lint warnings, an unambiguous canonical aisle route, 104 stable operations, 59 explicitly reasoned internal/retired operations, route coverage enforcement, and generated-contract smoke coverage.

There are 141 API method handlers under `/api/v1` but 104 documented OpenAPI operations. Validation also reports 11 warnings, including ambiguous shopping-list paths and missing 4xx responses.

- Document every supported public operation or explicitly mark internal routes.
- Resolve `/shopping-lists/{listId}/items` versus `/shopping-lists/aisles/{aisleId}` ambiguity.
- Add common validation/auth/origin/conflict responses and complete license metadata.
- Add route-to-spec coverage and generated-client smoke tests.

### V1-202 — Finish release operations and supportability

**Implementation status:** App/schema/migration health, System Settings status, redacted diagnostics/error fingerprints, recovery policy, semantic versioning, deprecation, rollback, and security reporting are implemented. Host-specific read-only/disk-full/container failure drills remain release-checklist evidence, not inferred success.

- Show app/build/schema versions and migration status in Settings and the health/support bundle.
- Add a redacted diagnostics export with recent application errors, storage health, migration state, and configuration presence only—never secrets or household content by default.
- Define backup schedule, retention, restore drill, corruption recovery, disk-full behavior, and media/database consistency rules.
- Add release notes, semantic versioning, deprecation policy, and a security-reporting path.
- Verify graceful startup failure for read-only volumes, missing write permissions, corrupt databases, invalid origins, and incomplete migrations.

### V1-203 — Close quality-gate noise

**Implementation status:** Resolved: lint warnings removed, the portable export test has an evidence-based isolated timeout, tracing warnings fail release builds, and Windows line-ending notices are separated from whitespace errors.

- Remove the three lint warnings in Nutrition integration fixtures/tests.
- Investigate or increase the evidence around the portable-export test's five-second timeout under heavy concurrent command load; keep the serial suite deterministic.
- Turn the Turbopack whole-project tracing warning into a failing assertion until V1-002 is fixed.
- Make `git diff --check` output on Windows distinguish LF-to-CRLF notices from actual whitespace errors.

### V1-204 — Verify the promised distribution targets

**Implementation status:** The read-only PWA contract is implemented and automated. Current Docker, Unraid, and real iPhone Safari evidence is blocked by unavailable target execution (the local Docker service is stopped and this token cannot start it); these targets must remain unchecked before public release.

- Build and inspect the real Docker image as non-root; verify clean install, persistent data, restart, healthcheck, migration, backup, and restore.
- Run the supported Unraid deployment with mounted storage and direct evidence before claiming it complete.
- Prove the read-only PWA contract: warmed recipe/library views remain readable offline, while mutations are clearly unavailable and never queued/replayed.
- Run real iPhone Safari acceptance for import selection/conversion, safe areas, keyboard behavior, sticky UI, and offline reading.

## Integration matrix

| Connection              | Current v1 state                                                                                                                                               | Evidence or remaining boundary                                                |
| ----------------------- | -------------------------------------------------------------------------------------------------------------------------------------------------------------- | ----------------------------------------------------------------------------- |
| Recipes -> Pantry       | Shared mutation commands preserve/remap ingredient identities, surface review states, and batch availability at bounded scale.                                 | Mutation and 1k/10k performance regression suites pass.                       |
| Recipes -> Nutrition    | Normalized versioned calculations are authoritative; legacy/imported/AI values are visibly source evidence.                                                    | Edit/tag/status/restore/estimator paths are regression-covered.               |
| Recipes -> Planner      | Plans pin title, recipe revision, calculation, servings, and ingredient/product snapshots until explicit refresh.                                              | Snapshot stability and refresh tests pass.                                    |
| Planner -> Nutrition    | UI/API/AI share Nutrition-aware commands; planned portions remain distinct from consumption and use household-local dates.                                     | Allocation parity and local-date suites pass.                                 |
| Planner -> Pantry       | Pinned demand subtracts exact mapped stock and commitments; unknown demand never fabricates a numeric shortage.                                                | Production browser and performance tests pass.                                |
| Planner -> Lists        | One durable Pantry-aware week/mode list is reused and regenerated without discarding protected/manual state.                                                   | Lifecycle and integrated browser tests pass.                                  |
| Lists -> Pantry         | Product/provenance identity survives recommendations and shortages; purchase intake is explicit, rich, and retry-idempotent.                                   | Recommendation and purchase-intake tests pass.                                |
| Cooking -> Pantry       | Literal confirmation drives atomic FEFO deductions, leftovers, provenance, and constrained undo.                                                               | Dedicated and integrated cooking workflows pass.                              |
| Cooking -> Nutrition    | Completion offers an explicit prepared batch linked to cook/plan/revision/calculation; consumption remains a separate explicit action.                         | Prepared-batch and consumption journey passes.                                |
| Profiles -> all domains | Signed actor attribution and profile-scoped preferences remain intact, while UI/docs state that profiles are convenience selectors rather than access control. | Public-internet authentication remains deliberately outside v1.               |
| AI -> core domains      | Confirmed AI actions use the same application commands and deterministic mocks as regular UI/API actions.                                                      | Live paid provider calls remain outside automated release evidence by policy. |

## Delivery sequence

### Phase 0 — Contain release risk

Complete V1-001 through V1-004. Freeze schema-changing feature work while the recipe command boundary and artifact tracing are repaired. Exit only when data integrity, artifact privacy, documentation truth, beta upgrade, and the integrated release oracle are green.

### Phase 1 — Complete the household loop

Complete V1-101 through V1-107. The exit journey is:

1. Create/import a recipe and map its ingredients.
2. Plan a pinned version and allocate portions.
3. Generate or refresh one Pantry-aware grocery list.
4. Check off and explicitly intake purchased items.
5. Cook with confirmed deductions and leftovers.
6. Create a linked prepared Nutrition snapshot.
7. Explicitly allocate/consume portions without inferring that planned, cooked, served, or stocked means eaten.

### Phase 2 — Scale and polish

Complete V1-108 through V1-110 and V1-201 through V1-203. Run design/a11y review on realistic populated and empty states, not only fixtures with one item.

### Phase 3 — Release candidate

Implementation phases 0-2 are complete. Phase 3 is held only on the direct Docker, Unraid, and real-iPhone evidence listed in V1-204. Do not publish until each claimed distribution target has that evidence.

## Release-candidate acceptance matrix

### Data and upgrades

- Fresh install through onboarding with default and non-default locale/time zone.
- Upgrade a representative last-beta backup through every migration.
- Restore the upgraded backup into a new instance and compare recipes, revisions, photos, Pantry batches/events, plans, lists, prepared Nutrition, diary history, settings, and profile attribution.
- Simulate interrupted startup/migration, corrupt backup, disk full, and read-only storage without partial writes.

### Cross-feature correctness

- A mapped recipe retains or explicitly reviews mappings after every edit/tag/status/restore/AI/estimator path.
- Editing a planned recipe cannot silently alter a pinned week's demand or Nutrition.
- Grocery regeneration preserves checked rows, manual edits, aisle assignment, Pantry controls, and source provenance.
- Purchased intake, cooking deduction, leftovers, prepared snapshots, allocation, consumption, correction, and undo each change only their intended state.
- Multi-profile planning never assumes an equal Nutrition split and never treats Pantry/planned/cooked data as consumed.

### UI and accessibility

- Desktop widths: 1280, 1440, and 1920 px. Mobile widths: 320, 375/390, and 430 px. Tablet: 768 px.
- No horizontal page overflow; intentional scrollers have visible affordances and keyboard access.
- Complete keyboard navigation, focus restoration, dialogs, validation summaries, live regions, reduced motion, light/dark themes, and axe checks.
- Verify loading, empty, populated, error, conflict, stale, offline, and long-content states.
- Confirm recipe cooking content is reached quickly on mobile and Nutrition view switching is obvious.

### Security and privacy

- Exact trusted-origin enforcement and HTTP input validation on every mutation.
- Signed `ActorContext` attribution preserved through all recipe history and integration commands.
- No browser bundle imports SQLite, filesystem, backups, provider credentials, or server-only services.
- No secrets or household data in logs, diagnostics, exports, build artifacts, container layers, caches, or error responses.
- Deterministic provider mocks by default; live paid calls require a separate credential gate and explicit approval.

### Distribution and operations

- Reproducible Docker build, non-root runtime, persistence, restart, upgrade, healthcheck, backup, and restore.
- Direct Unraid evidence only if Unraid is a supported v1 target.
- Read-only PWA behavior proven without mutation replay.
- Versioned release notes, checksums/signing where applicable, rollback instructions, and support/security contact.

## Definition of v1 ready

- No open P0 or P1 issues.
- The integrated release oracle passes from a clean checkout and clean data directory.
- A populated beta backup upgrades and restores without material loss.
- Standalone and container artifacts contain no household data, secrets, source/tests, or internal release-planning content.
- All supported pages pass desktop/mobile interaction, console, accessibility, and overflow review.
- OpenAPI and public documentation match the shipped product and trust boundary.
- Docker/Unraid/PWA/mobile claims are made only where direct release-candidate evidence exists.
- The shipped version has a rollback path, release notes, and an owner for support/security reports.

## What is already strong

- The design language is distinctive and consistent across the audited surfaces.
- Mobile layouts generally reflow well, and loading placeholders are non-interactive and accessible.
- Trusted-origin checks, server-only data/provider boundaries, signed actor attribution, deterministic provider testing, and conservative unknown Nutrition/Pantry semantics are good foundations.
- Pantry purchase intake and cooking confirmation preserve provenance and avoid pretending projections are stock or that cooked food was eaten.
- Normalized Nutrition keeps calculation evidence and completeness instead of converting missing data into zero.

The remaining safe path out of beta is operational rather than product implementation: validate the real Docker image, supported Unraid deployment, and real iPhone Safari target, then complete the release checklist without weakening the trusted-network boundary.
