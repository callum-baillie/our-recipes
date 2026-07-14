# T064 — Judge decision: bounded local OCR implementation

## Decision: approve one Worker, with a deliberately narrow claim

Approve T065, **Add bounded local English printed-scan OCR review assist**.

It may add a review-first, locally packaged English OCR suggestion for the
existing JPEG/PNG/WebP scan flow. It must call the feature a printed/legible
scan assist and must leave the original *handwritten OCR* acceptance criterion
open. The T063 primary-source evidence establishes that Tesseract.js is a
documented Node-compatible local WASM runtime, but its FAQ directly rejects an
expectation that configuration can materially improve handwriting recognition.

This is a useful, safe import improvement because it removes mandatory manual
retyping for suitable printed recipe scans while preserving the current source
artifact, provenance, editable review, and explicit recipe confirmation. It is
not a completion proxy for the original handwritten-recipe requirement.

## Approved technical boundary

### Exact dependencies and asset provenance

- Add only `tesseract.js@7.0.0` and `@tesseract.js-data/eng@1.0.0`, with exact
  versions and their registry integrity frozen in `pnpm-lock.yaml`.
- Use the data package's local `4.0.0/eng.traineddata.gz` asset. Add a
  source-controlled manifest stating package/version, npm integrity, upstream
  repository, asset relative pathname, license notice, and model purpose.
- Do not add a remote model URL, model-download script, native OCR executable,
  provider client, generic document converter, HEIC/HEIF decoder, archive
  handler, or PDF renderer.

### Runtime, safety, and Docker boundary

- Build an isolated server-only OCR adapter with a recognizer seam. Resolve the
  packaged asset to an absolute local path; reject missing, URL-like, or
  non-regular paths before worker creation.
- The Tesseract worker must use English LSTM mode, a local `langPath`, gzip
  enabled, and `cacheMethod: 'none'`. It must receive only a normalized local
  image buffer, never a user-controlled path or URL.
- Retain the current 15 MiB, 1–4 source image, 48 MP input, 2,500px normalized
  output, 100,000-character, and per-profile rate limits. Process artifacts
  serially in one worker. Limit the process to one active OCR job and two
  queued jobs; expose a retryable `ocr_busy` outcome when saturated.
- Bound initial worker setup plus the complete import to 45 seconds. Terminate
  the worker in `finally` and on timeout/error. Do not log images, OCR text,
  URLs, or stack traces.
- The production Dockerfile must copy the model asset from the build output to
  a read-only application path (not `/data`) and preserve the statically traced
  runtime dependencies. Do not run Docker in this Worker: a functional
  container proof remains blocked on the absent daemon.

### Review, database, API, and UI boundary

- Add a migration and schema/domain/API support for `local-ocr` and immutable
  OCR provenance: model manifest identifier, engine/package version, and a
  rounded aggregate confidence or a null/missing indication. Keep existing
  source hashes and ordered import artifacts.
- Normal-confidence text can prefill the review transcription only. Blank,
  missing-confidence, low-confidence, busy, timeout, or worker-error outcomes
  must show a generic warning and require manual transcription. They must not
  create, update, or overwrite a recipe.
- Keep textless PDFs manual. Do not change file acceptance. Preserve the
  existing explicit confirmation route and UI warning that every generated
  field requires review.

## Required files and tests

T065 may modify only the dependencies/lockfile, Dockerfile, relevant import
migration/schema/domain/service/storage/API/UI files, a small OCR/model
manifest and license notice, targeted unit/integration/optional smoke fixtures,
and relevant architecture/API/testing/status/checklist/decision documentation.

It must prove all of the following:

1. Model path validation and Tesseract options cannot fall back to a CDN.
2. Deterministic recognizer-seam tests cover normal, blank, low/missing
   confidence, busy, timeout, and worker-error review behavior.
3. Integration tests preserve ordered source provenance and explicit recipe
   confirmation for a multi-image import.
4. A local real-engine printed-English smoke test runs against a repository
   fixture and asserts only stable printed text tokens. It is not handwriting
   evidence.
5. Existing `pnpm install --frozen-lockfile`, format/lint/typecheck, unit,
   integration, end-to-end, accessibility, and release-quality suites remain
   green. Static inspection must show the runner-image model copy.

## Stop conditions

Reject/roll back the Worker result if package installation cannot maintain the
existing Windows dependency health, Tesseract v7 cannot initialize from the
packaged local model without a network request, model provenance cannot be
pinned, or the standalone/Docker copy cannot be made deterministic. Any such
failure must be recorded precisely; it must not be papered over with a CDN,
another package manager, cloud OCR, or weakened review requirements.

## Remaining acceptance gaps

- Locally bundled handwriting capability with representative evidence remains
  unimplemented.
- HEIC/HEIF, archives, OpenAI/provider work, Docker/Unraid runtime proof, and
  the final goal oracle remain separate tasks.
