# T026 — Manual recipe core decision

## Decision

Select the rich manual recipe workflow as the next Worker package. It is a direct release-acceptance gap with no external trust or credential dependency: the current schema can persist multiple ingredient and instruction sections, but the editor currently renders one of each. The recipe library is likewise limited to full-text search and a flat recent-update view.

## Ranking

1. **Manual recipe core (selected):** multi-section editing, metadata/lifecycle, keyboard-safe ordering, local recovery and conflict protection, then useful library filters/sorting/pagination.
2. **PDF/photo/handwriting capture:** must define isolated file validation, storage, parser/OCR behavior, and review lifecycle before accepting a document.
3. **AI provider boundary:** needs deterministic provider fixtures and a credential-safe status/configuration seam; live paid use remains unapproved.
4. **Docker/Unraid proof:** artifacts are ready but the Docker daemon and target host are unavailable, so no build, health, persistence, or host claims are made.
5. **Final quality audit:** waits for feature completion and fresh desktop/mobile/tablet/print/performance evidence.

## Boundary

T027 is additive and local. It must preserve existing recipes through the migration, never accept files or invoke OpenAI, retain the profile-is-not-authentication warning, and test conflict behavior rather than silently overwriting a newer recipe revision.
