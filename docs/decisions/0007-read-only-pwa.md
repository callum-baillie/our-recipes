# 0007 — read-only PWA cache

## Context

The household needs recipe access when its local network is temporarily unavailable, but profiles are not authentication and the application has no conflict-resolution or write-queue protocol. Caching writes or presenting locally queued changes as shared household state would be unsafe.

## Decision

Use the App Router manifest convention plus a small hand-authored service worker. The worker is registered only in a secure context and maintains one versioned cache. It precaches the offline fallback, removes older cache versions on activation, and caches only successful same-origin `GET` responses for previously viewed recipe-library/detail navigation pages, recipe read APIs, local recipe-image endpoints, manifest/icon assets, and Next static assets.

Recipe navigations use network-first with an already-cached response as fallback. Immutable Next static assets use cache-first. All other navigations use the network and fall back to the static offline page when unavailable. POST, PUT, PATCH, DELETE, background sync, push, credential storage, and replay are outside the worker entirely.

## Consequences

Previously viewed content remains readable and the PWA can be installed without adding a third-party cache framework. Offline mutation is intentionally unavailable; backup/restore, Docker, and broader import/OCR work remain separate packages.
