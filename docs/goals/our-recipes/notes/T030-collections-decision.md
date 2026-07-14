# T030 — Curated collections decision

## Decision

Select curated collections as the next Worker package. It completes the other half of household organization immediately after profile/tag governance, adds significant everyday browsing value, and is fully local, additive, and testable without accepting a new untrusted file type or calling a provider.

## Ranking

1. **T031 (selected):** persisted multi-recipe collections with manual ordering, optional covers selected from already-normalized recipe images, collection browse/detail/manage screens, recipe assignment, and a library collection facet.
2. **Document, PDF, scan, handwriting, and OCR capture:** essential but needs a separate upload/document-parser threat model, strict storage quotas, review semantics, and test fixtures. It should not be folded into organization work.
3. **AI provider boundary:** needs deterministic provider fixtures and credential-safe status/toggle behavior. No credential inspection or live paid request is authorized.
4. **Operational proof:** Docker/Unraid deployment and persistence remain release-critical, but Docker Desktop is unavailable; the checked-in artifacts cannot substitute for daemon or host evidence.
5. **Final performance/print/theme and release audit:** depend on the remaining feature work and need a full workflow plus current host evidence.

## Boundary

T031 may reuse only existing normalized recipe images as a collection cover; it must not add a new file upload or remote-image path. It must preserve recipe revisions and shared ownership, retain the non-auth profile warning, and keep collection mutation transactional and keyboard-accessible.
