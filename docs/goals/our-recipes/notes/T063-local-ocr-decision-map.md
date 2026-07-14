# T063 — local English OCR decision map

Date: 2026-07-13  
Scope: read-only research. No package/model installation, OCR execution, Docker execution, credential access, or source/configuration change was performed.

## Decision

Approve a later, **review-first local English printed-text OCR assist** only. The proposed implementation is `tesseract.js@7.0.0` plus a locally installed `@tesseract.js-data/eng@1.0.0` model package, with a local `langPath`, no URL inputs, no automatic recipe creation, and an explicit fallback to manual transcription.

Do **not** represent that implementation as a handwriting-OCR feature or use it to satisfy the original handwritten-recipe acceptance criterion. Tesseract.js’s own FAQ says no option meaningfully improves handwritten-text recognition and that results will be poor unless handwriting closely resembles printed text. No maintained, locally bundled, Node-24-compatible handwriting model with an acceptable licensing/deployment proof was identified in this read-only task. A true handwriting claim therefore remains open and needs separately selected model evidence and fixtures.

This decision deliberately does not add HEIC/HEIF conversion, archive extraction, scanned-PDF rendering/OCR, cloud OCR, or OpenAI/provider behavior.

## Current local boundary (verified)

| Area | Current fact | OCR consequence |
| --- | --- | --- |
| Runtime | `package.json` requires Node `>=24 <25`; Docker uses `node:24-bookworm-slim`. | `tesseract.js` v7 documents Node 16+ support, so Node 24 is in its documented range. This is compatibility evidence, not a completed Windows/Docker test. |
| Image admission | JPEG, PNG, or WebP only; 1–4 images; combined input at most 15 MiB. | OCR must not accept a new format or bypass the existing magic-byte and aggregate-size checks. |
| Image normalization | `sharp` rejects over 8,000px per side, 48 MP, and multi-frame images; it rotates, bounds output to 2,500px per side, and stores a WebP artifact. | Run OCR only over that normalized in-process WebP/buffer, one image at a time. Do not introduce a second unbounded decoder. |
| PDF import | One PDF, up to 12 pages; current implementation extracts embedded text only. Textless PDFs require manual transcription. | Tesseract.js explicitly scopes itself out of PDF-file support. Keep textless/scanned PDFs manual until a distinct PDF-rendering/OCR decision is approved. |
| Review and provenance | An import persists source hashes/artifacts, extraction method, extracted text, warnings, and requires an explicit recipe confirmation. Scan imports currently require 20–100,000 characters of manual transcription. | Add a distinct `local-ocr` method and model/version provenance; OCR text remains an editable review draft, never a direct recipe write. |
| Existing protection | Import starts are rate limited to six per profile per ten minutes. | Retain that limit and add an in-process OCR concurrency/queue limit; rate limiting alone does not cap worker memory. |

The facts above come from `src/lib/domain/import.ts`, `src/lib/services/import-service.ts`, `src/lib/storage/import-storage.ts`, `src/lib/db/schema.ts`, `package.json`, and `Dockerfile` as inspected on this date.

## Candidate comparison

| Candidate | Maintenance/runtime and model facts | License/deployment assessment | Decision |
| --- | --- | --- | --- |
| `tesseract.js@7.0.0` with packaged English data | Latest upstream release is v7.0.0 (2025-12-15), Apache-2.0, Node 16+; it wraps a WASM Tesseract worker. Its npm package depends on `tesseract.js-core@^7.0.0` (core package unpacked size about 45.3 MB). `@tesseract.js-data/eng@1.0.0` is a separate, 13.9 MB unpacked MIT package with no dependencies; its `4.0.0/eng.traineddata.gz` file is about 10.9 MB. | Pure Node/WASM avoids a new native SQLite-like platform binary and is compatible in principle with Windows Node 24 and Debian-slim. Default language resolution downloads from a CDN, so an explicit local `langPath` is mandatory. The data package’s npm integrity can be frozen in the existing lockfile. | **Approve only as a printed/legible-text assist**, subject to the implementation gates below. |
| Direct `tessdata_fast` vendoring | Official `tessdata_fast` publishes Apache-2.0 fast integer LSTM data for Tesseract 4/5; the current English file is 4,113,088 bytes by HTTP metadata. The project calls these a speed/accuracy compromise and documents English training on fonts. | The provenance is clearer than an intermediary package, but adding a binary asset requires a deliberate reproducible vendor/checksum process and Docker copy rule. That process was not performed by this task. | **Viable alternative**, but do not download or silently vendor it without a dedicated asset-provenance task. |
| `scribe.js-ocr@0.13.1` | Recently published and can OCR images and image-native PDFs, but package metadata reports AGPL-3.0, two dependencies, and about 66.9 MB unpacked. It also adds a canvas/native dependency surface. No primary source found here establishes handwriting quality. | Strong copyleft and additional runtime surface are a poor fit for this narrowly scoped, self-hosted application without a deliberate license review. It also expands PDF scope that this task must keep separate. | **Reject for this package.** |
| Cloud/API OCR or a handwriting model with no local/runtime evidence | Would either send household data away or need a separately evaluated model/runtime. | Conflicts with the local-only decision or lacks sufficient evidence. | **Reject/defer.** |

Primary sources consulted: [Tesseract.js README/release and scope](https://github.com/naptha/tesseract.js), [Tesseract.js local installation guide](https://github.com/naptha/tesseract.js/blob/master/docs/local-installation.md), [Tesseract.js API](https://github.com/naptha/tesseract.js/blob/master/docs/api.md), [Tesseract.js FAQ, including handwriting limitation](https://github.com/naptha/tesseract.js/blob/master/docs/faq.md), [official tessdata_fast](https://github.com/tesseract-ocr/tessdata_fast), and [English language-data package metadata](https://www.npmjs.com/package/%40tesseract.js-data/eng). Local `pnpm view` metadata was also captured for the exact versions and package sizes above.

## Required local-asset and privacy design

1. Add exact, non-range dependencies only after this decision is accepted: `tesseract.js@7.0.0` and `@tesseract.js-data/eng@1.0.0`. Freeze their registry integrity in `pnpm-lock.yaml`; record the data package version, npm integrity, upstream repository, and contained model pathname in a small source-controlled model manifest.
2. At runtime, resolve the packaged `4.0.0/eng.traineddata.gz` by an absolute filesystem path. Configure `createWorker('eng', 1, { langPath, cacheMethod: 'none', gzip: true })`; reject a path that is a URL, missing, outside the approved package location, or not a regular file. Never use the default `langPath`, which can fetch from jsDelivr.
3. The production Docker image must copy the language-data package/file into the runner image at a read-only application path. It is application content, not `/data`, and is not backed up with household data. The Next standalone output must include the static Tesseract runtime dependencies; verify that in a later daemon-backed Docker task.
4. Pass the normalized local image buffer only to the worker; never pass a user URL, remote URL, browser asset, PDF, archive, or HEIC/HEIF file. Do not emit OCR text to logs, telemetry, analytics, or an external service.
5. Persist the existing input source hashes/artifacts and add `local-ocr` plus immutable model provenance (package/version, model path, lock integrity/manifest identifier, engine version, and a rounded aggregate confidence). Preserve the original source; the review UI must show the text as a suggestion and its warnings.
6. Compute a conservative low-confidence state from worker word/line confidences only if the selected worker output exposes them. A missing score, blank/near-blank text, or low aggregate score must require manual transcription; it must never silently promote text to a recipe. Confidence is an OCR signal, not proof that a recipe is correct.

## Resource and failure boundaries for the future implementation

- Keep existing 15 MiB / 1–4-image / 2,500px-normalized limits. Process the four normalized images serially in one worker, then terminate the worker in `finally`, which matches upstream’s recommended multi-image lifecycle.
- Add a process-local OCR semaphore of one active job and at most two waiting jobs; return a clear retryable `ocr_busy` outcome if saturated. This avoids unbounded simultaneous WASM workers. Cross-process global scheduling is out of scope for the current single-container deployment.
- Set a total per-import OCR deadline (start at 45 seconds, measured around worker creation plus all serial recognition) and terminate the worker on deadline/error. Record only a generic review warning and require manual transcription; do not retain worker stack traces or source text in logs.
- Cap concatenated OCR text at the existing 100,000-character import limit before draft parsing. Treat blank OCR output as a valid no-text result and fall back to manual transcription, as documented by Tesseract.js.
- Do not infer handwriting success from confidence. For handwritten recipes, label the result “best-effort local OCR; verify every word” and preserve the required manual-entry path. It is acceptable for the feature to return no suggestion.

## Required fixture and test strategy

1. Unit-test model-path validation: missing package asset, URL-like path, unsupported language, and a valid local path. Assert `cacheMethod: 'none'` and no default/CDN configuration.
2. Unit-test the review policy with a small recognizer seam: normal confidence produces an editable `local-ocr` draft; blank, missing-confidence, timeout, worker error, and low-confidence outcomes require manual transcription and preserve a non-sensitive warning.
3. Integration-test the existing image artifact/provenance flow with deterministic local fake recognizer output. Confirm source hash, ordered artifacts, `local-ocr` method/model metadata, and explicit confirmation remain required.
4. Add one opt-in real-engine smoke test using a repository-owned, generated high-contrast **printed** English fixture. It may assert a small stable token set only; it must not gate the ordinary suite on handwriting accuracy. Run it on Windows Node 24 and, when the Docker daemon is available, in the container.
5. Add a deliberately non-assertive handwritten/low-legibility fixture only to prove the manual-review fallback, not recognition quality. Do not use a rendered cursive font as evidence of real handwritten accuracy.
6. Test multi-image serial processing, queue saturation, deadline termination, 100,000-character truncation/rejection, and no-network configuration. A later Docker test must prove the runner contains the model and can OCR the printed fixture with outbound networking disabled.

## Exact next Worker recommendation

Create a single implementation task titled **“Add bounded local English printed-scan OCR review assist”**.

Allowed scope:

- `package.json`, `pnpm-lock.yaml`, Dockerfile, model manifest/license notice, an import migration/schema/domain/service/API/UI change, targeted tests/fixtures, and the relevant architecture/API/testing/status/checklist/decision documentation.
- The two exact packages above, only through `pnpm`; no provider credential, live API call, HEIC/HEIF/archive/PDF-rendering work, or Docker execution unless separately authorized.

Required proof:

- Frozen install; format, lint, typecheck, unit/integration, current end-to-end/a11y/release-quality tests; plus the new local OCR tests.
- Static proof that the model path is local and the production copy rule is present. Docker functional proof remains separately blocked by the unavailable daemon.
- The implementation must leave handwriting acceptance explicitly open unless a distinct, licensed local handwriting model and representative acceptance fixtures prove it.

Stop/reject conditions:

- `tesseract.js` v7 cannot load the packaged model under Node 24 Windows without a network request;
- the standalone/Docker copy cannot retain the local assets in a reproducible way;
- the lockfile/asset provenance cannot be pinned; or
- the implementation attempts to widen into PDFs, HEIC/HEIF, archives, external OCR, or auto-save.

## Remaining evidence gap

This research makes the local printed-text assist safe to implement, but it does not close the original handwritten-OCR requirement. The later release audit must continue to list that criterion as incomplete until a separately approved handwriting-capable model is locally packaged, license-reviewed, tested against representative scans, and still constrained to manual review.
