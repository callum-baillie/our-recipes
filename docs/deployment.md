# Docker deployment

## Prerequisites

- Docker Engine with a current BuildKit-capable builder.
- A host directory dedicated to the container's `/data` volume. The image initializes ownership of this app-specific directory at startup, then runs the application as UID/GID `1001`.
- Independent high-entropy `COOKIE_SECRET` and `BETTER_AUTH_SECRET` values, plus exact
  `APP_ORIGIN`/`BETTER_AUTH_URL` values matching the household browser URL.
- SMTP host, sender, and credentials for verification and passphrase-reset email. Test delivery
  before accepting a production deployment.
- `AUTH_REQUIRE_EMAIL_VERIFICATION` defaults to `true` in production. Set it to `false` only for a
  trusted deployment where accounts may sign in before verifying email; passphrase resets still use SMTP.
- Optional `OPENAI_API_KEY` only when the household intentionally enables review suggestions or generated serving images. Never put `.api_keys` in a bind mount, image, or backup.
- Optional server-only `USDA_FDC_API_KEY` enables FoodData Central search. Open Food Facts exact barcode reads need no credential. Camera scanning requires the trusted Nginx Proxy Manager HTTPS route described in [food-data-integrations.md](food-data-integrations.md).

To point USDA searches at a local `bord-food-api` container, follow [the local food API guide](local-food-api.md), including its Compose environment override and connection checks.

Profiles are not authentication. Do not expose an `AUTH_MODE=none` household deployment directly to the public internet.

## Compose

```sh
cp .env.example .env
# Set both secrets, APP_ORIGIN/BETTER_AUTH_URL, and SMTP in .env.
# Set OPENAI_API_KEY only if intentionally enabling OpenAI actions.
docker compose up --build -d
docker compose ps
curl http://127.0.0.1:3000/api/v1/health
```

The image briefly starts its entrypoint as root to initialize ownership of the dedicated `/data` mount and the exact configured `BACKUP_DIR`, then drops to UID/GID `1001` and binds the app to port `3000` inside the container. SQLite, images, migration locks, and safe backup configuration remain below `/data`; completed bundles and pre-migration safety copies go to `BACKUP_DIR` (default `/data/backups`). The runner executes `scripts/container-migrate.mjs` before `server.js`; the script holds a migration lock and takes a pre-migration SQLite safety copy when a database already exists.

## Logging

The server writes one JSON line per event: debug and info to stdout, warn and error to stderr. Container tools such as Dozzle read that stream through the Docker socket, so nothing needs to be pushed anywhere. `LOG_LEVEL` is `debug`, `info` (default), `warn`, `error` or `silent`; `LOG_FORMAT=text` gives a plain one-line form for reading in a terminal. Set `LOG_LEVEL=debug` temporarily to see every request the sign-in gate accepts, redirects or refuses. Messages never include credentials, cookies, API keys or email addresses; fields under sensitive names are redacted.

## Health and persistence proof

When a Docker daemon is available, run:

```sh
pnpm test:docker
```

The script builds the image, checks its reported version/current migrations and non-root application process, and rejects unexpected credential/data paths in the runtime filesystem. It creates a synthetic household and recipe in a temporary bind-mounted volume, creates/downloads/validates a backup, restores it after another recipe is added, verifies session revocation and restored contents, then destroys/recreates the container and verifies persistence. It removes only the container and temporary host directory it creates. It binds its test port to loopback and disables email verification and external food lookup. No real household volume is used.

Set `DOCKER_SKIP_BUILD=true` and `DOCKER_IMAGE=ghcr.io/callum-baillie/bord:v1.0.0-rc.27` to inspect an already pulled release image. Its version must match `package.json`, or the explicit `DOCKER_EXPECTED_VERSION` when checking another version. The release workflow runs this disposable check on native amd64 and arm64 runners after publication; image build success and runtime smoke success remain separate results.

On 2026-07-13, this workspace ran the smoke command successfully against Docker Engine 29.6.1: the image built, `/api/v1/health` passed, first-run setup succeeded, and `setupComplete` persisted after recreation of its temporary bind-mounted container. It is a Linux container/persistence validation, not proof of Unraid share ownership, reverse proxy, or LAN exposure; review those separately on the target host.

## Upgrades and recovery

Back up the application from **Backups** before upgrading, download and validate that bundle, and record the exact current image tag/digest. Pull/rebuild the candidate, start it with the same `/data` mapping, then require health to report `status: ok`, the expected `version`, `schemaVersion`, and `migrationStatus: current` before accepting writes. Review representative recipes, photos, plans, Pantry, Lists, and Nutrition. The container startup migration takes a SQLite safety copy before applying migrations. See [backup and restore](backup-and-restore.md) for recovery.

For rollback, stop the new container. Do not run an older binary against a forward-migrated database. Start the prior image with a fresh empty data directory, place the validated pre-upgrade bundle where that version can restore it, and use its supported restore flow. Preserve the failed upgraded data root until comparison and support review are complete.

### Post-review schema compatibility

The post-review branch adds `0072_ai_execution_recovery` and `0073_shopping_cart_units` after the rc.18 history. Migration 0072 adds bounded chat ownership/recovery and content-free AI execution trace records. Legacy running turns without current ownership become review-required unknown outcomes; they are not automatically replayed. Legacy image jobs without a reviewed source revision require a new review rather than attachment.

Migration 0073 adds a nullable cart unit independently of recipe demand. Existing ambiguous cart amounts stay unreviewed; the application does not infer a unit from a display label or from recipe demand. Review the purchase amount/unit before unpacking those rows. New confirmed purchases preserve both dimensions through intake. No existing quantity or source identity is rewritten by the migration.

Email-verification links issued before this upgrade must be requested again at `/verify-email`. Verification now uses the installed authentication library plus an expiring, one-use issuance record so restore can revoke outstanding links as well as sessions and API keys. This does not change stored passwords or sign verified accounts out during an ordinary upgrade. Restoration still signs every session out. Use a validated pre-upgrade archive for rollback; never run an old binary on the migrated database.
