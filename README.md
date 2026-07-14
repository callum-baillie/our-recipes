# Our Recipes

Our Recipes is a self-hosted recipe manager for one trusted household. It currently supports editable household profiles, shared governed tags, curated collections, structured recipes with multi-section editing, local draft recovery, conflict-safe revisions, lifecycle/faceted search, review-first text/URL/PDF/scan/Schema.org JSON-LD capture, cooking mode, meal planning, editable shopping lists, print layouts, portable Recipe export, local recipe photos, rich source/equipment/nutrition card details, and profile-private ratings/notes.

> Profiles are not passwords or access control. Keep this app behind a trusted local network until an authenticated deployment is intentionally designed and reviewed.

## Release status

**v0.1.0-beta.4** is an early beta release. It is suitable for a trusted household that keeps regular backups, but it is not an authentication boundary and should not be exposed directly to the public internet. Please report issues in the [GitHub issue tracker](https://github.com/callum-baillie/our-recipes/issues).

## Install with Docker

The published image is `ghcr.io/callum-baillie/our-recipes:latest`. Its entrypoint initializes the mounted data directory, then runs the application as non-root UID/GID `1001`; it needs one durable host directory for SQLite, photos, and backups.

```sh
mkdir -p ./our-recipes-data
docker run -d \
  --name our-recipes \
  --restart unless-stopped \
  -p 3000:3000 \
  -v "$(pwd)/our-recipes-data:/data" \
  -e APP_ORIGIN=http://localhost:3000 \
  -e COOKIE_SECRET="replace-with-a-unique-secret-of-at-least-32-characters" \
  ghcr.io/callum-baillie/our-recipes:latest
```

Open `http://localhost:3000`, complete the first-run household setup, then use the in-app **Backups** area before upgrades. Confirm the container is healthy with `curl http://127.0.0.1:3000/api/v1/health`.

## Unraid install

1. Create `/mnt/user/appdata/our-recipes`. On first startup the image adjusts this app-specific directory for its non-root runtime user; do not bind it to a shared media directory.
2. In **Docker → Add Container**, set the repository to `ghcr.io/callum-baillie/our-recipes:latest` (keep the `latest` tag), map an unused host port such as `4123` to container port `3000`, and map `/mnt/user/appdata/our-recipes` to container `/data`.
3. Add `COOKIE_SECRET` (a unique value of at least 32 characters), `APP_ORIGIN` (for example `http://tower.local:4123`, matching the chosen host port), and `TZ`. `OPENAI_API_KEY` is optional and should be added only when you intentionally enable an AI action.
4. Apply the container, visit its WebUI, complete household setup, and confirm `http://tower.local:4123/api/v1/health` reports `{"status":"ok"}`.

You can also import [the Unraid template](unraid/our-recipes.xml). Keep `/data` persistent: it contains the database, images, and backup bundles. The dedicated [Unraid guide](docs/deployment-unraid.md) covers upgrades and host-specific checks.

## Run locally

1. Use Node 24 and Corepack-managed pnpm 11.
2. Copy `.env.example` to `.env.local` and set a long `COOKIE_SECRET` for any production-like run.
3. Install exact dependencies with `pnpm install --frozen-lockfile`.
4. Run `pnpm db:migrate` and `pnpm dev`.
5. Visit `http://localhost:3000` and complete the first-run form.

`DATA_DIR` defaults to `./data`; `DATABASE_URL` defaults to its `our-recipes.db` file. SQLite and normalized recipe photos live beneath this durable directory. Mount it in a future Docker/Unraid deployment; never rely on a container filesystem layer for either data or media.

## Quality commands

Use `pnpm verify` for the non-browser base gate. Browser and accessibility checks are separate: `pnpm test:e2e`, `pnpm test:a11y`, and `pnpm test:release-quality`. `pnpm test:e2e` is the fresh-household local acceptance flow: it exercises profile archive/restore, tag rename/merge/removal, collection membership/order/cover, review-first capture/import/JSON-LD, JSON-LD and Markdown exports, rich recipe history/preferences, cooking, planning/shopping, PWA reading, and backup validation. The release-quality command exercises the same setup-to-library foundation at desktop, tablet, and mobile widths; launches the library under system light and dark schemes; renders Letter/A4 recipe PDFs; and measures the real paginated full-text path over an isolated 10,000-recipe SQLite fixture. Its local 1.5-second query budget is a regression guard, not a cross-host production latency guarantee. See [testing documentation](docs/testing.md), [architecture](docs/architecture.md), [security boundary](docs/security.md), and [implementation status](IMPLEMENTATION_STATUS.md).

## Current boundaries

Recipe photos and document scans are signature-checked, size/dimension-bounded, stripped of source metadata, normalized to WebP, and retained only inside `DATA_DIR`. The local import hub accepts one PDF or one to four JPEG/PNG/WebP scans with a combined 15 MB limit; HEIC/HEIF is decoded to an in-memory JPEG in the browser before upload, so raw camera bytes never reach the server. PDFs have a 12-page and 100,000-character extraction limit. Clear English scans may receive a review-only suggestion from a pinned, locally packaged Tesseract WASM model; blank or low-confidence output still requires a user transcription, and textless PDFs always remain manual. Every accepted source retains ordered, hashed, reviewable provenance and only final confirmation creates a recipe. This is a printed/legible-text assist, not a handwriting-accuracy claim. Archives and remote-file imports remain unavailable.

Each recipe card can download a deterministic [Schema.org `Recipe`](https://schema.org/Recipe) JSON-LD document. The recipe library also offers a portable full-recipe `.tar.gz`: generated JSON-LD cards, referenced normalized WebP photos, and a checksummed manifest only. It is a local download, not an import or restore format; profile details, personal preferences, revisions, OCR/import data, storage keys, and secrets are never included. The import hub separately accepts up to 1 MB of pasted JSON-LD only: it examines top-level/`@graph` Recipe candidates locally, requires an explicit candidate choice and editable review, and creates a recipe only after confirmation. It does not fetch URLs, accept JSON-LD files or archives, store the pasted source, invoke a provider, or expose private household metadata in exports.

Recipe cards also record optional original author, source link, cooking method, ordered equipment, and user-entered nutrition values. Markdown download is a deterministic local transform of this shared card data. A selected profile may save a 1–5 rating and private kitchen note; these are neither shared recipe revisions nor included in any export, and the app never looks up nutrition data from a provider.

The library marks only the selected profile’s rating/favorite state and offers **Your highest rated** sorting; it does not turn a household member’s preference into a shared score. Recipe detail shows creation and last-edit attribution plus a revision timeline. Restoring a saved version explicitly creates a new conflict-protected revision, so prior history remains intact and personal preferences remain untouched.

## AI readiness

The kitchen navigation includes **AI status**. Set `OPENAI_API_KEY` only in the server runtime (or use the ignored root `.api_keys` convenience file during local development). The official SDK is server-only; `.api_keys` is never copied into Docker. Pasted text, normalized scan review, and generated serving images each require an explicit household action, have bounded inputs and a process-local rate limit, return an editable suggestion rather than saving a recipe, and write a content-free audit record. Tests use deterministic provider doubles; this workspace makes no paid live OpenAI request.

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

Our Recipes installs a small read-only PWA after a secure local visit. It keeps successful same-origin recipe-library/detail pages, local recipe images, recipe-read API responses, and Next static assets that have already been viewed. It never caches or replays writes, so creating/editing recipes, cooking, planning, and shopping-list changes require the household network. An uncached page shows the offline fallback instead of pretending a change was saved.

## Backup and recovery

Open **Backups** from the household home to create, download, validate, and restore a local recovery bundle. Bundles are stored in `DATA_DIR/backups`, include a consistent SQLite snapshot plus local `uploads`/`generated` media and safe household metadata, and never include environment secrets. Automatic in-process backups run every `BACKUP_INTERVAL_HOURS` (24 by default); bundles older than `BACKUP_RETENTION_DAYS` (30 by default) are removed during the next successful backup.

Before a restore, the app validates archive paths, manifest/schema information, every SHA-256 checksum, and SQLite integrity. It makes a pre-restore safety backup and requires typing `RESTORE` before atomically replacing the local data directory. See [backup and restore](docs/backup-and-restore.md) for recovery steps and limitations.

## Docker and Unraid

The repository includes a non-root multi-stage Docker image, compose files, an Unraid template, and a daemon-run persistence smoke script. See [Docker deployment](docs/deployment.md) and [Unraid deployment](docs/deployment-unraid.md). The local Docker smoke test validates image build, health, first-run setup, and persistence across a temporary container recreation; Unraid host ownership and reverse-proxy settings remain operator checks.
