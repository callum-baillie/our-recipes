# 0020 — Bounded multi-image recipe scan sets

- Status: accepted
- Date: 2026-07-13

## Context

Many handwritten recipes span two or more photos. The prior local import
boundary safely accepted one PDF or one JPEG/PNG/WebP scan, but a single
`storage_key` could not retain the source order or independent provenance of a
scan set.

## Decision

- An import operation accepts either exactly one PDF or one to four
  JPEG/PNG/WebP scans. All sources together stay within the existing 15 MB
  bound; PDFs cannot be mixed with scans.
- `import_artifacts` is an additive child table. It stores an opaque artifact
  ID/key, safe source label, SHA-256, media type, and position. Its migration
  backfills every existing one-file operation as position zero, preserving
  backup and review behavior.
- Each scan keeps the existing Sharp pixel/frame bounds and is independently
  normalized to a metadata-stripped WebP. One combined manual transcription is
  required for a scan set, and the review screen shows ordered private previews
  before a recipe can be explicitly confirmed.
- Single-file clients retain compatibility through the prior multipart `file`
  field and primary `/file` read. New clients submit repeated `files` fields
  and use an import-scoped artifact read route.

## Consequences

This adds no image decoder, OCR engine, archive extractor, external fetch, or
provider call. HEIC/HEIF, handwriting OCR, and archive intake remain separate
decisions because current Windows/Docker compatibility and their security
boundaries are not yet proven. Any future implementation must preserve this
review-first artifact/provenance model.
