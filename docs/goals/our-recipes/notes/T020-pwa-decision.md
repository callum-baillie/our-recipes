# T020 — PWA read-only offline decision

## Ranked remaining gaps

1. **Read-only PWA/offline recipe access:** all household workflows now have stable dynamic pages and local media endpoints, but a previously viewed recipe cannot be reliably opened while the household LAN is unavailable. This is a direct original requirement and can be bounded to cache successful same-origin reads only.
2. **Backup/restore:** now materially more important because `DATA_DIR` contains SQLite plus images. It needs a distinct operator-focused package with quiescence, media consistency, checksums, rollback/overwrite controls, and representative recovery proof.
3. **PDF, archive, handwriting, and OCR capture:** a high-value import path, but it combines document/image parser limits, archive traversal controls, optional OCR/AI policy, and review semantics. It needs a separate threat-boundary package.
4. **Docker/Unraid packaging and persistence:** release-critical but cannot be claimed without a daemon and an operator-mounted-volume environment.
5. **AI provider behavior and final audit:** must remain mock-first; live paid calls require explicit permission and are not needed for this package.

## Decision

T021 should add a deliberately small, read-only PWA: App Router manifest and local icons, service-worker registration, versioned cache cleanup, a static offline fallback, and explicit cache strategies for successful same-origin navigation documents, Next static assets, recipe-detail API reads, and normalized recipe-image reads. It must never cache requests other than `GET`, cache a failed response, replay a mutation, store credentials, or claim offline creation/editing/planning/list changes. Browser proof must warm a real recipe page, take the context offline, and prove the already-viewed recipe and its image remain readable.

The service-worker and manifest approach follows the current Next App Router manifest convention and MDN Service Worker/Cache API guidance: a worker can intercept requests and choose cache/network responses, while POST is inappropriate for caching. See the sources recorded in the T020 board receipt.
