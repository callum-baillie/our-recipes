# T021 — read-only PWA implementation receipt

## Delivered

- Added App Router manifest metadata and a local maskable SVG icon.
- Added secure-context service-worker registration with no third-party PWA dependency.
- Added a versioned Cache API worker that precaches the static offline fallback, removes stale cache versions, and only handles successful same-origin `GET` reads.
- Cached strategies cover previously visited recipe-library/detail navigation pages, recipe read APIs, local normalized recipe images, the manifest/icon, and Next static assets. Mutations, sync queues, push, credential storage, and replay are absent.
- Added a responsive offline fallback that states the exact read-only boundary.

## Evidence

- Chromium warms a real recipe plus local photo, verifies the manifest, takes the browser context offline, and proves the recipe heading and decoded image remain available.
- Axe passes on both the first-run and offline-fallback pages.
- Visual QA at 1440px and 390px found the fallback centered, legible, and free of clipping/overlap. No console warnings or errors were observed.

## Verification

`pnpm install --frozen-lockfile`, `pnpm verify`, `pnpm test:e2e`, `pnpm test:a11y`, and `git diff --check` pass. Redocly retains the repository's three pre-existing non-blocking metadata/4xx warnings.

## Remaining gaps

Backup/restore, Docker/Unraid packaging and mounted-volume proof, PDF/archive/handwriting/OCR imports, AI provider behavior, richer editing/filters, and final release audit remain separate packages. Docker was not available and no remote/paid/destructive work was used.
