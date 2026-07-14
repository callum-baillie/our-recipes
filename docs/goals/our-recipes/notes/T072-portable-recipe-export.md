# T072 — portable full-recipe export

Date: 2026-07-13  
Status: complete

## Delivered

- `GET /api/v1/exports/recipes` now creates a local, no-store download named
  `our-recipes-portable-recipes.tar.gz` after verifying a signed active profile.
  A supplied `Origin` must be same/trusted; a normal direct download without an
  `Origin` remains supported.
- The archive is generated from a private temporary directory and contains only
  `manifest.json`, deterministic positional Schema.org JSON-LD recipe
  documents, and content-SHA-256-addressed normalized WebP copies. It never
  accepts, extracts, or restores an archive.
- The manifest has a stable format/version, state-derived snapshot timestamp,
  document/media mapping, byte lengths, and SHA-256 values. Duplicate image
  bytes are emitted once. It contains no household/profile identity, private
  preferences, revisions, imports/OCR provenance, storage keys, configuration,
  or backup data.
- Limits reject more than 10,000 recipes, 50,000 distinct images, JSON-LD or
  media over 10 MB, a manifest over 16 MB, and uncompressed output over 1 GB.
  Missing/non-regular/symlink media is rejected; temporary staging and archive
  files are cleaned up after the stream closes or any failure.
- The library now offers an explicit **Download recipe archive** action while
  retaining the individual JSON-LD and Markdown exports.

## Evidence

- A focused integration test creates only a self-generated test archive, lists
  and reads it, verifies sorted entries/checksums/Schema image references,
  byte-for-byte determinism, media deduplication, private-field/storage-key
  exclusion, the oversized-media limit, and source-symlink rejection.
- Playwright verifies the normal local download filename plus 409 without a
  selected profile and 403 for an explicit untrusted origin.
- `pnpm install --frozen-lockfile`, `pnpm verify`, `pnpm test:e2e`,
  `pnpm test:a11y`, `pnpm test:release-quality`, `pnpm test:ocr:smoke`,
  `pnpm db:check`, `pnpm audit --prod --audit-level=moderate`, and
  `git diff --check` passed.

## Non-blocking warnings

- Redocly reports the existing seven documentation warnings.
- Turbopack retains the existing backup-route file-tracing warning.
- Docker daemon/Unraid proof, handwriting OCR, HEIC/HEIF, and the separately
  credential-gated OpenAI boundary remain outside this package.
