# 0013 — Keep document import local, bounded, and review-only

## Decision

Add a dedicated local document-import boundary for one PDF or one recipe scan at a time. PDF.js extracts embedded PDF text on the server; JPEG, PNG, and WebP scans are decoded, orientation-normalized, metadata-stripped, and retained only as normalized WebP. Every import creates an `import_operations` provenance record and a review draft. A recipe is created only by the explicit confirmation endpoint.

## Rationale

Files are untrusted input. The boundary derives type from magic bytes, caps a source at 15 MB, caps PDFs at 12 pages and extracted text at 100,000 characters, rejects invalid/multi-frame or decompression-bomb-like images through Sharp limits, and never uses the client filename as a path. Artifacts use opaque server-generated keys under `DATA_DIR/generated/imports`, so existing backup/restore already carries them with the operation record.

PDF.js runs from installed assets only; the route never fetches a URL or calls a provider. OCR is intentionally not simulated: when a scan or textless PDF needs transcription, the user supplies it and the draft clearly records that fact. A future locally bundled OCR model may implement the same seam only after its model, runtime, retention, performance, and test evidence are separately reviewed. OpenAI/provider work remains behind the credential and paid-call gate.

## Consequences

- `import_operations` stores the byte hash, safe display name, derived media type, extraction method/text, warnings, actor, confirmation actor/time, and confirmed recipe link.
- The normalized scan or accepted PDF is preserved with the database in existing `generated` backups; client paths, declared MIME types, and source EXIF are not canonical metadata.
- Imports are rate-limited per active profile to six starts per ten minutes in the running process. Production-wide rate limiting remains a deployment concern for any multi-process topology.
- Image OCR, HEIC/HEIF, multiple-page scan bundles, arbitrary document formats, archives, remote files, and provider normalization are intentionally outside this package rather than silently downgraded or sent elsewhere.
