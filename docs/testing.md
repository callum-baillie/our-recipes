# Testing strategy

Food-provider tests are deterministic by default: inject fetch mocks for success, absence, malformed data, timeouts, quota headers, and partial provider failure. Live calls are opt-in only with `RUN_FOOD_PROVIDER_LIVE_TESTS=1`; never use a household key or `DEMO_KEY` in normal CI. Camera QA covers secure/insecure contexts, permission denial, duplicate reads, stream cleanup, manual fallback, and desktop/mobile layout.

`pnpm test:unit` validates pure input, signed-cookie, capture, byte-derived import boundaries (including raw HEIC rejection), blank-MIME iPhone file detection, client conversion limits/timeouts, local-OCR guardrails, URL/JSON-LD boundaries, recipe behavior, and deterministic OpenAI SDK request shaping. `pnpm test:integration` uses isolated SQLite/data directories to prove household, import, export, media, backup, and AI-operation behavior: provider doubles receive only bounded text or normalized scan data; content-free audit rows and locally normalized generated images are verified without an external request. `pnpm test:ocr:smoke` runs only the packaged local-model printed-English fixture and does not assert handwriting recognition. `pnpm test:e2e` is the fresh-household local acceptance flow, including an actionable unsupported-file error plus real HEIC and HEIF fixture conversion in Chromium before the existing server import gate. `pnpm test:a11y` and `pnpm test:release-quality` cover the established accessibility, responsive, color-scheme, print, and library-performance matrix. A Chromium mobile viewport/UA check is useful regression evidence but is not a substitute for acceptance on an actual iPhone Safari engine.

Nutrition foundation integration tests apply all committed migrations to isolated SQLite, verify the 46-code canonical registry, prove explicit source priority, append-only product and recipe revisions, sparse missing-data behavior, conversion-evidence validation, contribution traceability, and a real `0016` backfill against a recipe inserted after migration `0015`. These tests make no provider or paid network call and do not treat Pantry stock or planned meals as consumed food.

Nutrition household-integrity tests run only against disposable SQLite databases. They prove deterministic transactional create/update/archive/restore behavior and rollback, physical one-to-one linkage, exact signed actor/principal persistence, forged-pair rejection, and migration anomaly rollback. The lineage matrix pins the LF-only `0028` source and journal entry, distinguishes the exact 15-column pre-migration prepared shape from the exact 16-column post-migration actor shape, and rejects wrong actor column/FK/index definitions, marker hashes/order, and unknown suffixes.

Pantry grocery/cooking tests use isolated in-memory databases. They prove multi-recipe definitive and uncertain recipe/meal/date/serving/contribution provenance, source recipe IDs, null uncertainty, rendered generated/manual/obsolete state labels, preservation of manual values while obsolete generated persistence/rendering claims are cleared, atomic row/override writes, pre-dispatch operation-key persistence across concurrent/rejected/unknown fetches, rotation only after confirmed success, explicit confirmation, multi-batch FEFO ordering, recipe/meal/list/cook/actor event linkage, atomic compensating undo and cook-plan transitions, newer-event/repeated-undo/linked-leftover conflicts, and exact-origin rejection. No test mutates `data/our-recipes.db`, owns a shared `.next` directory, or makes a provider call.

The grocery formula suite separately proves missing/all persistence, opted-in threshold-triggered staples, max recipe-versus-staple behavior, manual extras, grocery-only batch exclusion, ignore-Pantry and inaccurate controls, normalized purchased coverage without double counting the linked batch, full rich batch-field mapping, and operation-key replay. The isolated browser oracle covers 390, 768, and 1280 pixel layouts, keyboard access, reload persistence, accessibility scans, screenshots, and browser-error capture.

Pantry inventory-management tests additionally cover full product, alias, staple, location, and batch edits; every lifecycle/quantity action; inactive views and query semantics; truthful date-kind/precision labels; and atomic split/combine with stale-version and paired-undo evidence. Rendered Playwright coverage performs mutations only through controls and checks desktop, tablet, and mobile layouts, keyboard operation, accessibility, screenshots, reload persistence, and console errors.

Before a release or dependency update, run `pnpm audit --prod --audit-level=moderate` in addition to the ordinary frozen install and quality gates. The current workspace uses the documented narrow Next-to-PostCSS override in decision 0024; audit evidence must show no production advisory rather than merely an accepted warning.

The Playwright preparation script deletes only the generated `.test-data` directory before starting the test server. It does not touch the normal `data` directory. CI must install a compatible Playwright browser image before browser tests; normal code tests do not call external AI services.

AI coverage verifies the all-required Structured Outputs contract, configured/unconfigured safe status, explicit confirmation, bounded review/image inputs, rate limit, no-raw-content audit, and deterministic provider behavior. Browser coverage proves HEIC/HEIF conversion and the non-secret status/settings surface. No automated path makes a paid OpenAI request.

Run `pnpm test:docker` to build the image and prove health plus setup persistence across recreation of a temporary bind-mounted volume. It does not publish an image, modify an Unraid host, or read `.api_keys` because Docker build context excludes it.

Run the full application and release gates with:

```sh
pnpm install --frozen-lockfile
pnpm format:check
pnpm lint
pnpm typecheck
pnpm test:unit
pnpm test:integration
pnpm test:v1-release
pnpm openapi:validate
pnpm build:release
pnpm diff:check
```

The focused Pantry recipe/planner suite covers serving scale, required-first compatible-unit allocation, filters and compact/detail rendering, durable planned/skipped/cancelled status, derived cooked exclusion, chronological exhaustion, recorded expiry-before-meal context, and non-mutation. Its isolated Playwright flow uses disposable data, 390/768/1280 viewports, keyboard interaction, axe checks, persisted reload, responsive containment, screenshots, and captured browser-error assertions.
