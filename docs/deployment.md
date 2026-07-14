# Docker deployment

## Prerequisites

- Docker Engine with a current BuildKit-capable builder.
- A host directory dedicated to the container's `/data` volume and writable by UID/GID `1001`.
- A unique `COOKIE_SECRET` of at least 32 characters and an exact `APP_ORIGIN` matching the household browser URL.
- Optional `OPENAI_API_KEY` only when the household intentionally enables review suggestions or generated serving images. Never put `.api_keys` in a bind mount, image, or backup.

Profiles are not authentication. Do not expose an `AUTH_MODE=none` household deployment directly to the public internet.

## Compose

```sh
cp .env.example .env
# Set COOKIE_SECRET and APP_ORIGIN in .env. Set OPENAI_API_KEY only if intentionally enabling OpenAI actions.
docker compose up --build -d
docker compose ps
curl http://127.0.0.1:3000/api/v1/health
```

The image runs as UID/GID `1001`, binds port `3000` inside the container, and stores SQLite, images, backups, migration locks, and safe backup configuration below `/data`. The runner executes `scripts/container-migrate.mjs` before `server.js`; the script holds a migration lock and takes a pre-migration SQLite safety copy when a database already exists.

## Health and persistence proof

When a Docker daemon is available, run:

```sh
pnpm test:docker
```

The script builds the image, waits for `/api/v1/health`, creates a setup record in a temporary bind-mounted volume, destroys/recreates the container with that same volume, and confirms `setupComplete` persists. It removes only the container and temporary host directory it creates.

On 2026-07-13, this workspace ran the smoke command successfully against Docker Engine 29.6.1: the image built, `/api/v1/health` passed, first-run setup succeeded, and `setupComplete` persisted after recreation of its temporary bind-mounted container. It is a Linux container/persistence validation, not proof of Unraid share ownership, reverse proxy, or LAN exposure; review those separately on the target host.

## Upgrades and recovery

Back up the application from **Backups** before upgrading. Pull/rebuild the new image, start it with the same `/data` mapping, then inspect the health endpoint and household data. The container startup migration takes a SQLite safety copy before applying migrations. See [backup and restore](backup-and-restore.md) for recovery.
