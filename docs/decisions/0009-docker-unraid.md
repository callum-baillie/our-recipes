# 0009 — Docker and Unraid preparation

## Context

The application has SQLite, Sharp, local media, backup/recovery, and a PWA. It needs a reproducible single-container path for an Unraid household while preserving `/data` and avoiding root runtime processes.

## Decision

Use a multi-stage `node:24-bookworm-slim` build with Corepack/pnpm only in build stages and Next standalone output in a non-root runner. The runner owns `/data`, runs a lock-protected startup migration script, exposes a health check, and starts `server.js`. Compose and Unraid artifacts mount a single durable `/data` root; an optional CI workflow builds multi-architecture images and only pushes when an explicit release/manual trigger runs.

## Consequences

The repository has static deployment artifacts and a daemon-run smoke/persistence script. Docker Engine and an Unraid host are unavailable in this workspace, so no build, health, volume, or host deployment success is claimed yet.
