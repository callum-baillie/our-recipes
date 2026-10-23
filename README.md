# Bòrd

Bòrd is a self-hosted recipe keeper, meal planner, nutritional advisor, and grocery store helper for one trusted household. Its customizable kitchen name and icon personalize the shared experience while Bòrd remains the product brand.

Its optional OpenAI assistant can read permitted recipe, planning, and nutrition context; prepare review-first app changes; generate meal plans from new or existing recipes; and create daily or weekly summaries. Model/reasoning choices are configurable per workload, while each profile controls which data categories may be sent.

> Better Auth accounts control access. A household profile is a viewing and attribution context, not a second identity or an independent permission grant. Keep server secrets private and configure exact trusted origins and HTTPS for the intended deployment.

## Release status

**v1.0.0-rc.21** is a release candidate, not a public v1 tag. The [current refinement register](docs/refinement/README.md), [capability matrix](docs/refinement/capability-matrix.md), [release checklist](docs/release-checklist.md), and [release notes](docs/release-notes.md) distinguish delivered behavior from device, live-provider and deployment checks. Please report issues through the [support and security guide](docs/support.md).

## Install with Docker

The published image is `ghcr.io/callum-baillie/bord:latest`. Its entrypoint initializes the mounted data directory, then runs the application as non-root UID/GID `1001`; it needs one durable host directory for SQLite, photos, and backups.

```sh
cp .env.example .env
# Configure separate COOKIE_SECRET/BETTER_AUTH_SECRET, the exact browser URL,
# and your verified email sender/SMTP credentials in .env before starting.
mkdir -p ./bord-data
docker run -d \
  --name bord \
  --restart unless-stopped \
  -p 3000:3000 \
  -v "$(pwd)/bord-data:/data" \
  --env-file .env \
  -e DATA_DIR=/data \
  -e DATABASE_URL=/data/bord.db \
  ghcr.io/callum-baillie/bord:latest
```

Open the configured `APP_ORIGIN`, complete first-run account/household setup and save the one-time recovery codes. Use the in-app **Backups** area before upgrades. Confirm local liveness with `curl http://127.0.0.1:3000/api/v1/health`; liveness alone does not prove email or provider readiness.

## Unraid install

1. Create `/mnt/user/appdata/bord`. On first startup the image adjusts this app-specific directory for its non-root runtime user; do not bind it to a shared media directory.
2. In **Docker → Add Container**, set the repository to `ghcr.io/callum-baillie/bord:latest` (keep the `latest` tag), map an unused host port such as `4123` to container port `3000`, and map `/mnt/user/appdata/bord` to container `/data`.
3. Configure separate `COOKIE_SECRET` and `BETTER_AUTH_SECRET` values of at least 32 characters; matching `APP_ORIGIN` and `BETTER_AUTH_URL`; and the `AUTH_EMAIL_FROM`/`AUTH_SMTP_*` settings in [.env.example](.env.example). Preserve deliberate email-verification policy. Set `TZ` for operational timestamps. `OPENAI_API_KEY` stays optional and server-only.
4. Apply the container, visit its WebUI, complete household setup, and confirm `http://tower.local:4123/api/v1/health` reports `{"status":"ok"}`.

You can also import [the Unraid template](unraid/bord.xml). Keep `/data` persistent for the database and images, and use the template's dedicated `/backup` mapping when a host tool such as Kopia will protect recovery bundles. The dedicated [Unraid guide](docs/deployment-unraid.md) covers upgrades and host-specific checks.

## Run locally

1. Use Node 24 and Corepack-managed pnpm 11.
2. Copy `.env.example` to `.env.local`; configure both secrets, matching local origins and the intended email policy. `AUTH_DEV_EMAIL_LOG` is a deliberate development-only alternative; never enable it for real recovery traffic.
3. Install exact dependencies with `pnpm install --frozen-lockfile`.
4. Run `pnpm db:migrate` and `pnpm dev`.
5. Visit `http://localhost:3000` and complete the first-run form.

`DATA_DIR` defaults to `./data`; new installations default to `bord.db`. Container startup renames an unambiguous legacy `our-recipes.db` and its SQLite sidecars before opening SQLite; local development continues to resolve an existing legacy file safely. SQLite and normalized recipe photos live beneath this durable directory.

## Quality commands

The PDF regression checks require Poppler’s `pdftotext` on `PATH` (`sudo apt-get install poppler-utils` on Debian/Ubuntu). CI installs it explicitly; the application runtime does not require this test-only command.

Use `pnpm verify` for the complete non-browser code/build/artifact gate and `pnpm test:v1-release` for the isolated browser release oracle plus 1,000/10,000-recipe performance guards. The browser oracle resets only `.test-data` between specs and includes the explicit Recipe → plan → Pantry-aware list → purchase intake → cook → prepared Nutrition → consumption journey without external provider traffic. See [testing documentation](docs/testing.md), [architecture](docs/architecture.md), [security boundary](docs/security.md), and [implementation status](IMPLEMENTATION_STATUS.md).

## Current boundaries

Recipe photos and document scans are signature-checked, size/dimension-bounded, stripped of source metadata, normalized to WebP, and retained only inside `DATA_DIR`. The mobile-first import hub accepts one PDF or one to four JPEG/PNG/WebP scans with a combined 15 MB limit. HEIC/HEIF preparation first uses native browser decoding when available, then falls back to the bundled browser-only decoder; either path creates an in-memory JPEG before upload, so raw camera bytes never reach the server. The page preserves Safari selections with both input event paths, shows preparation/readiness/errors explicitly, bounds conversion time, and always offers a recovery action instead of a silently disabled button. PDFs have a 12-page and 100,000-character extraction limit. Manual transcription is optional for scans: the default OpenAI-vision option sends normalized scans only after the user presses **Create OpenAI review draft**, giving handwritten recipes an editable review suggestion. The local Tesseract path remains available to compatible callers as a printed/legible-text assist; textless PDFs always remain manual. Every accepted source retains ordered, hashed, reviewable provenance and only final confirmation creates a recipe. Archives and remote-file imports remain unavailable.

Each recipe card can download a deterministic [Schema.org `Recipe`](https://schema.org/Recipe) JSON-LD document. The recipe library also offers a portable full-recipe `.tar.gz`: generated JSON-LD cards, referenced normalized WebP photos, and a checksummed manifest only. It is a local download, not an import or restore format; profile details, personal preferences, revisions, OCR/import data, storage keys, and secrets are never included. The import hub separately accepts up to 1 MB of pasted JSON-LD only: it examines top-level/`@graph` Recipe candidates locally, requires an explicit candidate choice and editable review, and creates a recipe only after confirmation. It does not fetch URLs, accept JSON-LD files or archives, store the pasted source, invoke a provider, or expose private household metadata in exports.

Recipe cards also record optional original author, source link, cooking method, ordered equipment, and user-entered nutrition values. Markdown download is a deterministic local transform of this shared card data. A selected profile may save a 1–5 rating and profile-scoped kitchen note; these are neither shared recipe revisions nor included in any export. Profiles are switchable household views, not confidentiality boundaries.

The library marks only the selected profile’s rating/favorite state and offers **Your highest rated** sorting; it does not turn a household member’s preference into a shared score. Recipe detail shows creation and last-edit attribution plus a revision timeline. Restoring a saved version explicitly creates a new conflict-protected revision, so prior history remains intact and personal preferences remain untouched.

## AI readiness

The kitchen navigation includes **AI status**. Set `OPENAI_API_KEY` only in the server runtime (or use the ignored root `.api_keys` convenience file during local development). The official SDK is server-only; `.api_keys` is never copied into Docker. Shared workload/model/prompt policy caps personal defaults and instructions. Paid generation requires explicit consent. Chat text is progressive, while reviewed mutations report acknowledged, partial or unknown outcomes. Manual generated photos use private previews before acceptance. A SQLite-backed worker resumes queued work after restart; Direct/Batch policy and threshold are configurable, with the current default threshold of two items. A submitted Batch can take up to 24 hours. See [AI operation and recovery contracts](docs/refinement/ai-system.md) and [image evaluation](docs/refinement/recipe-images.md). Tests use deterministic provider doubles; no paid live request is implied by their results.

Pantry, recipe ingredients, Nutrition and the native scanner share reviewed source identities and exact revisions. Configure the [native Bòrd Food API](docs/bord-catalog-integration.md) for catalog modes, or use the compatible direct USDA/Open Food Facts providers. Reads never import food or record stock, purchases or intake. Camera scanning is optional and requires trusted HTTPS—see [food data providers and barcode scanning](docs/food-data-integrations.md). Manual workflows remain available during a catalog outage.

For a public recipe URL, the server first applies its DNS, private-network, redirect, content-type, timeout, and 1 MB response limits. It then parses only the returned bounded HTML with a server-side markup parser—never rendering the page, executing scripts, or downloading its resources. Embedded Schema.org JSON-LD Recipe candidates take precedence, followed by Microdata; Open Graph and readable page text are an explicitly warned review fallback. Tests use local fixtures and mocked fetch/DNS responses rather than live recipe sites.

## Planning and shopping

The planner supports a saved recipe or a bounded free-form breakfast, lunch,
dinner, or snack title. Weeks can be copied forward without mutating their
source and exported as a deterministic local `.ics` calendar file. Generated
shopping lists remain independent editable copies: structured numeric recipe
ingredients scale and combine conservatively, while free-form meals add no
invented ingredients.

Households can name and reorder store aisles. List rows render inside those
saved aisle groups (with an explicit **Unassigned** group), so the display
order is useful in a shop while each item remains editable, checkable, and
traceable. Removing an aisle leaves its items unassigned instead of deleting
them. All planning and shopping mutations require the household network; they
are not PWA-cached or replayed offline.

## Household organization

Profiles are editable household preferences and attribution markers, not user accounts. A profile may be archived only after another active profile exists; archive keeps historical recipe and cooking attribution intact. Tags are a shared lower-cased catalog with optional colors and recipe usage counts. Renaming or merging a tag preserves its recipe links, while removing it detaches only that tag. The recipe editor offers the current household tags as autocomplete suggestions, but the server remains the normalization and integrity boundary.

Collections are named, manually ordered recipe shelves. A recipe can belong to many collections without changing recipe content or revision history. A collection cover may use only an existing normalized photo from one of its member recipes, so it does not create another upload or remote-image surface. Removing a collection removes its memberships only; it never removes a recipe or photo.

## Offline reading

Bòrd installs a small read-only PWA after a secure local visit. It keeps successful same-origin recipe-library/detail pages, local recipe images, recipe-read API responses, and Next static assets that have already been viewed. It never caches or replays writes, so creating/editing recipes, cooking, planning, and shopping-list changes require the household network. An uncached page shows the offline fallback instead of pretending a change was saved.

## Backup and recovery

Open **System Settings → Local recovery** to create, download, validate, and restore a recovery bundle. Bundles are stored in `BACKUP_DIR` (default `DATA_DIR/backups`), include a consistent SQLite snapshot plus local `uploads`/`generated` media and safe household metadata, and never include environment secrets. Automatic in-process backups run every `BACKUP_INTERVAL_HOURS` (24 by default); bundles older than `BACKUP_RETENTION_DAYS` (30 by default) are removed during the next successful backup. A dedicated mounted `BACKUP_DIR`, such as `/backup`, lets Kopia or another host tool protect completed bundles independently.

Before a restore, the app validates archive paths, manifest/schema information, every SHA-256 checksum, and SQLite integrity. It makes a pre-restore safety backup and requires typing `RESTORE` before replacing the database/media with rollback protection while retaining the mounted data directory. An interrupted recovery blocks database use until repaired. See [backup and restore](docs/backup-and-restore.md) for recovery steps and limitations.

## Docker and Unraid

The repository includes a non-root multi-stage Docker image, compose files, an Unraid template, and a daemon-run smoke script. See [Docker deployment](docs/deployment.md) and [Unraid deployment](docs/deployment-unraid.md). The Docker smoke test checks version/migrations, the non-root process, first-run setup, backup download/validation/restore, session revocation and persistence across a temporary container recreation. Release CI runs it on native amd64 and arm64; Unraid host ownership and reverse-proxy settings remain operator checks.
