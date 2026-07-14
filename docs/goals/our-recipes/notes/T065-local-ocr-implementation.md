# T065 — bounded local English printed-scan OCR

## Result

Implemented a local, review-first English **printed/legible-scan** OCR assist.
It is not represented as handwriting OCR and does not close that original
acceptance criterion.

## Delivered boundary

- Added exact `tesseract.js@7.0.0` and `@tesseract.js-data/eng@1.0.0`
  dependencies. Their full registry integrity/provenance/licensing data is
  frozen in the lockfile and recorded in `src/lib/ocr/model-manifest.ts`.
- The Tesseract worker resolves only the packaged
  `4.0.0/eng.traineddata.gz` through a validated absolute local path,
  configures `cacheMethod: 'none'`, and never relies on default/CDN language
  retrieval. The local model smoke test passed on Windows Node 24.
- The OCR adapter accepts only pre-normalized in-memory scan buffers, handles
  1–4 scans serially in one worker, allows one active job plus two local
  waiters, returns retryable `ocr_busy` when saturated, and has a 45-second
  deadline with worker termination.
- Local OCR output is an editable review draft only. Blank, missing/low
  confidence, unavailable, or timed-out OCR requires manual transcription;
  no imported recipe is written until explicit confirmation.
- `import_operations` now records `local-ocr` plus immutable model, wrapper,
  data, detected-engine, and rounded-confidence provenance. Existing source
  hashes and ordered normalized artifacts are unchanged.
- Docker statically copies the worker, core, WASM feature detector, and model
  data as read-only application content outside `/data`. A source-level test
  verifies this packaging. Docker was not run because the daemon is unavailable.
- The Tesseract package’s only install hook is OpenCollective messaging, not a
  runtime/model build. `pnpm-workspace.yaml` explicitly disables that hook,
  keeping frozen Windows installs non-interactive without loosening the
  existing native-build approvals.

## Evidence

Passed after implementation:

- `pnpm install --frozen-lockfile`
- `pnpm verify` — 30 unit and 19 integration tests, format/lint/typecheck,
  OpenAPI validation, and production build
- `pnpm test:ocr:smoke` — locally generated printed recipe image recognized by
  the bundled model
- `pnpm test:e2e` — fresh household Chromium flow
- `pnpm test:a11y` — 2 axe flows
- `pnpm test:release-quality` — responsive/light-dark/print plus 10k search
- `pnpm db:check`
- Goal-state checker and `git diff --check`

Known non-blocking warnings are unchanged: seven OpenAPI documentation
advisories and the backup-route Turbopack file-trace advisory. The Docker
daemon remains unavailable, so no Docker build/run/persistence claim is made.

## Explicit remaining gaps

- A separately selected, licensed, locally bundled handwriting-capable model
  with representative acceptance evidence.
- HEIC/HEIF, archive handling, provider work under the credential gate,
  daemon-backed Docker/Unraid proof, and final release audit.
