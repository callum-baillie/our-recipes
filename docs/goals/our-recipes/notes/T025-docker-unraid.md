# T025 — Docker and Unraid preparation receipt

## Delivered

- Added a multi-stage Node 24 Debian-slim Dockerfile with Next standalone output, a non-root UID/GID 1001 runner, persistent `/data`, health check, and startup migration command.
- Added a lock-protected container migration script that enforces a `DATA_DIR` database path, creates a pre-migration SQLite safety copy, checks integrity, and applies committed Drizzle migrations before `server.js` starts.
- Added standard and Unraid compose examples, an importable Unraid custom template, multi-architecture GHCR release workflow, Docker ignore rules, and a daemon-run smoke/persistence script.
- Added detailed Docker/Unraid deployment, upgrade, security, and recovery documentation.

## Evidence

- The container migration entrypoint ran twice against a newly created isolated data directory and left a valid SQLite database, proving the local startup migration path is repeatable.
- Normal browser, accessibility, unit, integration, OpenAPI, and production build checks pass after enabling standalone output.
- Docker daemon check failed before any build: Docker Desktop's `dockerDesktopLinuxEngine` named pipe is absent. No Docker image, container, volume, or remote publication was created.

## Verification

`pnpm install --frozen-lockfile`, `pnpm verify`, `pnpm test:e2e`, `pnpm test:a11y`, and `git diff --check` pass. Redocly retains three pre-existing non-blocking warnings. Next build retains a non-fatal file-tracing advisory for the intentionally server-only archive/storage service.

## Remaining gaps

Run `pnpm test:docker` with a Docker daemon and perform target Unraid review to prove image build, health, startup migration, and mounted-volume persistence. PDF/archive/handwriting/OCR capture, AI provider behavior, richer recipe organization/performance, and final audit remain separate work.
