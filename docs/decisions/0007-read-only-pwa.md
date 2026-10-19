# 0007 — read-only PWA cache

## Context

The household needs recipe access when its local network is temporarily unavailable, but profiles are not authentication and the application has no conflict-resolution or write-queue protocol. Caching writes or presenting locally queued changes as shared household state would be unsafe.

## Decision

Use the App Router manifest convention plus a small hand-authored service worker. The worker is registered only in a secure context and maintains a versioned read cache. It precaches the offline fallback and caches eligible successful same-origin `GET` recipe-detail navigations, local recipe images, manifest/icon assets and Next static assets. It does not cache the recipe-library catalogue or recipe read APIs. Navigation paths that do not produce an eligible document request need not create an offline copy. Authentication transitions clear app read caches.

Recipe navigations use network-first with an already-cached response as fallback. Next static assets also use network-first with cached fallback. All other navigations use the network and fall back to the static offline page when unavailable. POST, PUT, PATCH, DELETE, background sync, push, credential storage, and replay are outside the worker entirely.

## Consequences

Eligible cached recipe pages may remain readable without adding a third-party cache framework. Uncached recipes, plans, lists and the library require network access. Offline mutation is intentionally unavailable; backup/restore, Docker, and broader import/OCR work remain separate packages.

## Update and recovery lifecycle

Browser connectivity events trigger a same-origin health check; they do not prove kitchen availability. Offline retry checks access to the intended same-origin page and then navigates, without replaying writes. A direct visit falls back to the ordinary online recipe-library destination.

An updated worker waits for explicit **Reload when ready**. Both controller changes and worker messages show the same notice; neither worker activation nor the client silently navigates an entered form. This deliberate boundary also applies on a clean page, avoiding an unreliable global guess about dirty forms. Credential values are never persisted for update recovery. Multiple notifications do not start multiple reloads.

Activation retains older app caches while existing windows finish their work. A window acknowledges the build it actually loaded; older/legacy caches are cleaned only when every open window has acknowledged the active version. Authentication cache clearing remains unconditional. No background sync or offline mutation queue is added.
