# 0006 — local recipe image handling

## Context

The shared recipe workflow needed a way to retain photographs without turning client filenames, MIME declarations, or browser-visible paths into trusted storage input. PDF, handwriting, remote-image, archive, and OCR paths have materially different parser and threat boundaries.

## Decision

Only direct local JPEG, PNG, and WebP uploads are accepted in this package. The server first checks a 10 MB byte limit and binary signature, then uses Sharp with a 40-megapixel decoder limit to read metadata. It rejects unsupported formats, dimensions above 8,000 pixels, and multi-frame images. Accepted input is oriented, limited to 1,600 pixels on either output dimension, stripped of source metadata by a fresh WebP encode, and saved under an opaque UUID key below `DATA_DIR/uploads`.

SQLite stores attribution, safe display metadata, and the opaque key. Recipe-scoped endpoints serve only normalized `image/webp` with `X-Content-Type-Options: nosniff`; add/remove writes require the existing trusted-origin and active-profile checks.

## Consequences

The household receives local, durable recipe photos without external calls or a public upload directory. The same durable-root and server-side processing seam can support later features, but it does not authorize PDF, archive, handwriting/OCR, remote fetch, AI generation, or PWA cache work.
