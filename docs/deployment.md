# Docker deployment

## Prerequisites

- Docker Engine with a current BuildKit-capable builder.
- A host directory dedicated to the container's `/data` volume. The image initializes ownership of this app-specific directory at startup, then runs the application as UID/GID `1001`.
- A unique `COOKIE_SECRET` of at least 32 characters and an exact `APP_ORIGIN` matching the household browser URL.
- Optional `OPENAI_API_KEY` only when the household intentionally enables review suggestions or generated serving images. Never put `.api_keys` in a bind mount, image, or backup.
- Optional server-only `USDA_FDC_API_KEY` enables FoodData Central search. Open Food Facts exact barcode reads need no credential. Camera scanning requires the trusted Nginx Proxy Manager HTTPS route described in [food-data-integrations.md](food-data-integrations.md).

Profiles are not authentication. Do not expose an `AUTH_MODE=none` household deployment directly to the public internet.

## Compose

```sh
cp .env.example .env
# Set COOKIE_SECRET and APP_ORIGIN in .env. Set OPENAI_API_KEY only if intentionally enabling OpenAI actions.
docker compose up --build -d
docker compose ps
curl http://127.0.0.1:3000/api/v1/health
```

The image briefly starts its entrypoint as root to initialize ownership of the dedicated `/data` mount, then drops to UID/GID `1001`, binds the app to port `3000` inside the container, and stores SQLite, images, backups, migration locks, and safe backup configuration below `/data`. The runner executes `scripts/container-migrate.mjs` before `server.js`; the script holds a migration lock and takes a pre-migration SQLite safety copy when a database already exists.

## Health and persistence proof

When a Docker daemon is available, run:

```sh
pnpm test:docker
```

The script builds the image, waits for `/api/v1/health`, creates a setup record in a temporary bind-mounted volume, destroys/recreates the container with that same volume, and confirms `setupComplete` persists. It removes only the container and temporary host directory it creates.

On 2026-07-13, this workspace ran the smoke command successfully against Docker Engine 29.6.1: the image built, `/api/v1/health` passed, first-run setup succeeded, and `setupComplete` persisted after recreation of its temporary bind-mounted container. It is a Linux container/persistence validation, not proof of Unraid share ownership, reverse proxy, or LAN exposure; review those separately on the target host.

## Upgrades and recovery

Back up the application from **Backups** before upgrading, download and validate that bundle, and record the exact current image tag/digest. Pull/rebuild the candidate, start it with the same `/data` mapping, then require health to report `status: ok`, the expected `version`, `schemaVersion`, and `migrationStatus: current` before accepting writes. Review representative recipes, photos, plans, Pantry, Lists, and Nutrition. The container startup migration takes a SQLite safety copy before applying migrations. See [backup and restore](backup-and-restore.md) for recovery.

For rollback, stop the new container. Do not run an older binary against a forward-migrated database. Start the prior image with a fresh empty data directory, place the validated pre-upgrade bundle where that version can restore it, and use its supported restore flow. Preserve the failed upgraded data root until comparison and support review are complete.
