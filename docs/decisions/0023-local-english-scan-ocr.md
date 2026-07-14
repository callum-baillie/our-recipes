# 0023 — bounded local English scan OCR

## Context

Household scan imports already had byte-derived type checks, aggregate byte and
pixel limits, metadata-stripping normalization, ordered source provenance, and
an explicit recipe-review step. They required manual transcription because a
default Tesseract.js model path would obtain language data from a CDN. The
product requires useful local document intake but must not send household scans
to a provider or claim handwriting recognition it cannot prove.

## Decision

Use `tesseract.js@7.0.0` and `@tesseract.js-data/eng@1.0.0` only for a
review-first English printed/legible-scan assist. Both exact package integrity
values are recorded in `src/lib/ocr/model-manifest.ts` and frozen in the pnpm
lockfile. Tesseract.js is Apache-2.0; the language-data package declares MIT
and identifies `naptha/tessdata` as its source repository. The runtime
resolves the packaged `4.0.0/eng.traineddata.gz` file through a validated local
absolute directory, uses `cacheMethod: 'none'`, and rejects URL-like/missing
paths. It never accepts a model URL or uses the default CDN lookup.

The service normalizes existing accepted scan bytes before OCR, processes at
most four buffers serially in one worker, permits one active job plus two local
waiters, and terminates the worker on normal completion, error, or a 45-second
deadline. It records only an editable draft plus `local-ocr` model, wrapper,
data, detected-engine version, and rounded confidence provenance. Blank,
missing/low-confidence, unavailable, or
timed-out results demand manual transcription. Confirmation remains the sole
recipe write.

The Docker runner copies the worker/core/model packages as immutable
application content, outside `/data`. This is static packaging evidence only:
daemon-backed Docker/Unraid validation remains open.

## Consequences

Clear printed recipes can avoid retyping without an outbound OCR request. The
model asset is immutable package content and not household data or backup
content. Textless PDFs, HEIC/HEIF, archives, providers, and automatic saving
remain out of scope.

Tesseract.js documentation says its options do not significantly improve
handwritten-text recognition. This decision therefore does **not** satisfy the
original handwriting-OCR criterion; a separately licensed local model plus
representative evidence is required before that criterion can be checked off.
