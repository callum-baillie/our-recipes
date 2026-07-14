# 0025 — Portable full-recipe export is generated output, not archive intake

## Decision

Use the already pinned `tar@7.5.20` only to create a download-only portable
recipe archive. `GET /api/v1/exports/recipes` stages deterministic Schema.org
`Recipe` JSON-LD and existing normalized WebP copies, then streams one
`our-recipes-portable-recipes.tar.gz` file. The endpoint never accepts archive
bytes, paths, files, or restore requests.

Each archive contains a `manifest.json`, positional `recipes/00001.jsonld`
documents, and content-SHA-256-addressed `images/*.webp` files. The manifest
records the format/version, a state-derived snapshot timestamp, document/media
mappings, byte lengths, and checksums. Using a state-derived timestamp rather
than wall-clock export time preserves byte-for-byte determinism for unchanged
recipe data. Duplicate normalized image bytes are emitted once and can be
referenced by more than one document.

## Boundaries

- Require an active signed profile. Reject an explicit untrusted `Origin`; a
  normal browser download has no `Origin` header.
- Stage only regular generated files below a private temporary data directory.
  Source media must be a regular file and have a WebP signature; no symlink or
  storage path is copied into the archive.
- Bound the export to 10,000 recipes, 50,000 distinct images, 10 MB per
  JSON-LD/media file, a 16 MB manifest, and 1 GB uncompressed content. Both
  staging and archive files are removed on success, failure, or stream
  cancellation.
- Exclude household/profile identities, ratings/notes, revision snapshots,
  imports/OCR provenance, storage keys, database/configuration/backups, and
  any server secret. The archive is portable recipe content, not a lossless
  backup; existing listed local backup/restore remains the recovery path.

## Evidence

The integration suite creates and reads only a self-generated test archive to
verify entry ordering, JSON-LD image references, checksums, deterministic
bytes, duplicate-media behavior, private-field exclusion, oversized-media
rejection, and symlink rejection. The fresh Chromium workflow triggers the
ordinary recipe-library download. No production route extracts this format.
