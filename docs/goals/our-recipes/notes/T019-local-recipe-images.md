# T019 — local recipe image media implementation receipt

## Delivered

- Added direct Sharp 0.35.3 support and a `recipe_images` migration with opaque storage keys, recipe/profile attribution, alt text, normalized dimensions, and timestamps.
- Added `DATA_DIR` as the durable root. SQLite keeps its existing configurable URL; recipe media is written atomically below `DATA_DIR/uploads`, never the web root.
- Added server-only JPEG/PNG/WebP signature checks, a 10 MB byte cap, decoder pixel/dimension limits, multi-frame rejection, orientation, metadata-stripping WebP normalization, and path-containment checks.
- Added recipe-scoped add/read/remove APIs and a responsive recipe-photo gallery with optional description and remove control.
- Updated the OpenAPI contract, deployment/runtime docs, security boundary, data model, visual specification, and decision record.

## Evidence

- Unit coverage rejects non-image input, proves WebP normalization and output bounds, and rejects oversized dimensions.
- SQLite integration coverage proves image metadata and durable file creation/removal.
- Chromium coverage performs setup, capture confirmation, a real Sharp-generated PNG upload, and confirms the rendered image has decoded pixels.
- Visual QA inspected the recipe gallery at 1440px and 390px after the image load event; it showed the normalized local image without clipping or overlap. The in-app Browser adapter handled setup/capture but lacks file-input and screenshot operations, so the project Playwright runner supplied the documented fallback for media upload and screenshots.

## Verification

`pnpm install --frozen-lockfile`, `pnpm verify`, `pnpm test:e2e`, `pnpm test:a11y`, and `git diff --check` pass. Redocly retains the repository's three pre-existing non-blocking metadata/4xx warnings.

## Remaining gaps

PDF/archive/handwriting/OCR capture, AI behavior, PWA read-only caching, backup/restore, Docker/Unraid packaging and proof, and final release audit remain separate packages. No live OpenAI, remote image fetch, Docker claim, publishing, or destructive operation was used.
