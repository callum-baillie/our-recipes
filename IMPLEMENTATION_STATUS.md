# Implementation status

## In this foundation

- [x] Pinned Next/TypeScript/pnpm foundation with a frozen lockfile.
- [x] Drizzle SQLite migration, WAL configuration, and server-only service layer.
- [x] First-run household and initial profile persistence.
- [x] Profile units, temperature, locale, timezone, color, and optional-avatar API field.
- [x] Signed HttpOnly active-profile cookie and `ActorContext` seam.
- [x] Versioned health/setup/profile endpoints with input and origin checks.
- [x] Shared manual recipe library with structured ingredients/method, SQLite FTS search, source metadata, print styles, and actor-attributed revisions.
- [x] Weekly recipe/free-form breakfast, lunch, dinner, and snack planning; copy-forward and deterministic ICS export; separately generated editable shopping lists with conservative quantity scaling, traceable recipe sources, and durable ordered aisle groups.
- [x] Per-profile cooking mode with immutable scaling, local multi-timers, temperature conversion, favorites, and completed cook-session history.
- [x] Review-first pasted-text and public-URL capture drafts with explicit recipe confirmation, server-only SSRF/content limits, deterministic Schema.org JSON-LD/@graph candidate selection, Microdata extraction, and Open Graph/text fallback warnings.
- [x] Local recipe photos with bounded JPEG/PNG/WebP validation, server-side normalization, opaque durable storage, and add/view/remove UI.
- [x] Installable read-only PWA with warm-cache recipe/image access and an honest offline fallback; mutations never queue or replay offline.
- [x] Local database/media backup bundles with checksummed manifests, scheduled retention, preview, explicit safety-backed restore, and isolated round-trip proof.
- [x] Docker/Unraid deployment artifacts: non-root standalone image, startup migration, compose/template, build workflow, and daemon-run smoke/persistence script.
- [x] Local Docker Engine 29.6.1 build, health, first-run setup, and temporary bind-mounted persistence recreation proof (2026-07-13).
- [x] Rich manual recipe cards: multi-group/multi-section editor, keyboard ordering, local draft recovery, unsaved-change warning, optimistic revisions, lifecycle actions, and paginated recipe facets/sorting.
- [x] Household profile settings plus globally governed tags with usage, colors, safe rename/merge/delete, and editor autocomplete.
- [x] Curated collections with ordered many-to-many recipe membership, safe recipe-photo covers, browse/manage pages, and library filtering.
- [x] Bounded local PDF or 1–4 JPEG/PNG/WebP scan-set import with byte-derived aggregate validation, local PDF text extraction, ordered normalized child artifacts/hashes, durable provenance, editable review, and explicit recipe confirmation.
- [x] Deterministic Schema.org Recipe JSON-LD export plus bounded local pasted JSON-LD candidate selection, editable review, and confirmation without remote/file/provider intake.
- [x] Server-generated full recipe portability archive: deterministic JSON-LD cards, content-hash-addressed normalized WebP copies, checksummed manifest, bounded temporary output, and a local browser download; no archive intake or restore route.
- [x] Server-only official OpenAI provider with strict structured outputs, explicit review/image actions, bounded input, rate limits, content-free audit records, local generated-image storage, and deterministic doubles (no paid live call).
- [x] Rich recipe-card metadata (original author, source, cooking method, ordered equipment, and user-entered nutrition), deterministic Markdown export, and per-profile private ratings/notes isolated from shared revisions and exports.
- [x] Profile-aware library rating/favorite indicators and highest-rated sorting, recipe attribution, revision timeline, and guarded snapshot restore that appends history rather than overwriting it.
- [x] Responsive visual specification, product concept, first-run UI, unit/integration/e2e/a11y test sources, and CI workflow.
- [x] System light/dark cookbook presentation, responsive desktop/tablet/mobile checks, US Letter/A4 recipe print rendering, and an isolated 10,000-recipe paginated library/search performance check.
- [x] Fresh-household local release acceptance flow covering profile archive/restore, tag and collection governance, review-first capture/import/portability, rich recipe history/preferences, cooking, planning/shopping, PWA reading, and backup validation.

## Deliberately unrun live check

- Bounded local English printed-scan OCR uses a pinned package model, local filesystem-only worker path, review-only provenance, manual fallback, and a printed-fixture smoke test. Explicit configured OpenAI vision provides the reviewable handwritten-photo/scan path; browser-only HEIC/HEIF conversion is covered with real codec fixtures. Arbitrary archive intake remains intentionally unsupported.
- No paid live OpenAI request was made. This is intentional: automated tests use deterministic provider doubles, and a live request remains opt-in after explicit operator approval.
- Docker Engine 29.6.1 validates the image, health, first-run setup, and temporary bind-mounted persistence recreation. The Unraid template and documentation are complete; no operator Unraid host was modified during validation.

## Dependency Recovery

- Original failure: Windows pnpm installation failed while opening package manifests under generated dependency state (first `better-sqlite3`, then `playwright-core`).
- Diagnosis and recovery: workspace configuration was valid; switching to pnpm's Windows-compatible hoisted/copy layout and removing only generated dependency state restored frozen installs without changing the locked stack or SQLite driver.
- Final resolution: frozen install, recursive list, Node execution, build, and the downstream test suite now run on the documented pnpm configuration. See [decision 0019](docs/decisions/0019-pnpm-linker-recovery.md).
- Developer workflow: use `pnpm install --frozen-lockfile`; if a Windows linker tree is interrupted, remove only generated dependency directories and reinstall. Use Docker validation for the Linux production foundation.
