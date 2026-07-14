# T024 — Docker and Unraid preparation decision

## Ranked remaining gaps

1. **Docker/Unraid release preparation:** the application now has durable `DATA_DIR`, media, migration, backup, health, PWA, and recovery semantics. The release oracle still requires a non-root production image, persistent `/data` mapping, startup migration, health checks, a smoke/persistence procedure, and Unraid deployment artifacts. Those files can be implemented and statically verified without a daemon; no container claim is valid until an operator runs the documented commands.
2. **PDF/archive/handwriting/OCR capture:** a major household feature, but it needs a separate file/document threat boundary and review flow. It must not be folded into deployment work.
3. **AI normalization/generation:** remains mock-first and credential/paid-approval-gated.
4. **Richer recipe organization/performance/final audit:** important after release infrastructure and import boundaries are in place.

## Decision

T025 should create the full self-hosted deployment package: a multi-stage Debian-slim Node 24 image running non-root, standalone Next output, deterministic startup migration/health behavior, a `/data` volume, no secret baked into layers, Docker compose examples, an Unraid-compatible template, smoke/persistence scripts that can be run later, environment documentation, and GitHub release-build workflow that does not publish without explicit authorization. It must run all local non-Docker quality gates and clearly record the daemon-less verification limit.

The Worker may not pretend that static review, build success, or generated compose files prove a Docker build, health check, volume persistence, or Unraid deployment.
