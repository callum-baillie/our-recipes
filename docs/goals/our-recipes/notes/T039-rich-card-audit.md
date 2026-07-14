# T039 — Rich recipe-card package audit

## Result: not complete

T038 is a verified additive improvement: shared author/source/method/equipment/nutrition fields are part of the ordinary optimistic recipe graph and revision snapshot; profile ratings/notes are composite-keyed and omitted from profile-neutral reads and both exporters. The local Markdown route and rich edit/detail UI are covered by integration, Chromium, and axe tests.

## Current evidence

- `pnpm install --frozen-lockfile`, `pnpm verify`, `pnpm test:e2e`, `pnpm test:a11y`, and `git diff --check` passed for T038.
- The unit/integration suite includes input bounds, equipment persistence, revised rich metadata, preference isolation, preference clearing, and Markdown privacy. The Chromium flow saves rich metadata and a personal rating/note; axe covers the resulting detail page.
- No provider credential, nutrition lookup, remote data call, or Docker/Unraid operation was introduced. OpenAPI validates with the existing five non-blocking documentation warnings; the production build retains the known backup-route Turbopack file-trace warning.

## Remaining core recipe-workflow gaps

The new preference table is not yet surfaced as a compact rating on library cards or as the required **highest rated** sort. Recipe detail still lacks explicit creator/last-editor/date attribution and a visible revision timeline; snapshots exist but there is no guarded restore path. These are central household-recipe requirements and can be delivered entirely against local SQLite, the existing signed profile seam, and deterministic tests.

## Next task decision

T040 should complete a coherent **profile-aware recipe discovery and revision-history** vertical slice: show the selected profile’s rating/favorite state in library cards and provide a clearly scoped highest-rated sort; display creator/editor/time attribution and revisions on recipe detail; and allow an explicit expected-revision-protected restore of one stored snapshot. The task must preserve profile privacy, append rather than overwrite history, keep all exports free of personal fields, and add API/OpenAPI/documentation/e2e/a11y coverage. It needs no provider, credential, remote source, or daemon.

The goal remains far from the Docker deployment oracle and still has separately gated OpenAI/OCR work plus final visual/performance/release evidence, so it cannot be marked complete.
