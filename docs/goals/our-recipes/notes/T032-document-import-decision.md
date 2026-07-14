# T032 — Hardened document import decision

## Decision

Select a local document and scan import package before the OpenAI provider boundary. It advances the required review-first capture path without credentials, paid traffic, or an external network dependency, while establishing the file size/type/page/pixel/provenance limits that AI assistance must later respect.

## Ranking

1. **T033 (selected):** a bounded local PDF/image/handwriting intake with server-side validation and extraction/OCR seams, persistent operation provenance, an editable review stage, and explicit recipe confirmation.
2. **AI provider boundary:** the safe `OPENAI_API_KEY` presence check found no key in this shell. The OpenAI credential gate requires an explicit create-key decision before any API-backed implementation, configuration, or test; deterministic mocks remain the later default.
3. **Docker/Unraid daemon proof:** remains release-critical but unavailable until a Docker-capable host is present.
4. **Final performance/print/theme and release audit:** depends on outstanding import, provider, and operations work.

## Boundary

T033 must not accept archives, make remote requests, invoke an AI provider, or silently persist an extracted recipe. It must use byte-derived type checks and bounded parsers/OCR seams, retain only safe local provenance for a review operation, and provide a manual correction path whenever extraction is incomplete or low confidence.
