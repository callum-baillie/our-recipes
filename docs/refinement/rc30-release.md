# RC30 Add to pantry page and Pantry edit mode

RC30 is RC29's feature set with one production fix. It changes no schema (`0082_scanner_stations` / 84 migrations), key, permission or scanner binding. See the release notes for the feature list.

RC29's published image must not be deployed: its `/pantry/add` page returned HTTP 500 in the built server. A local function named `process` in the camera scan hook shadowed Node's global in the release bundle, where Next's minifier injects `process.env` guards. Only the release build exposed it; development mode and the earlier Playwright runs used the dev server. The oracle caught it through React error #419 on `/pantry`.

Verification on the rc.30 source: Prettier, lint, TypeScript, OpenAPI validation and the release build pass; 139 unit files / 796 tests pass; all fifteen browser-oracle specs and the recipe-performance test pass against the built standalone server.

Deployment evidence for Tower is recorded below once the deployment is complete.

## Tower deployment — 28 October 2026 (CDT; 29 October UTC)

The [rc.30 multi-architecture build and both container smoke jobs](https://github.com/callum-baillie/our-recipes/actions/runs/40806843873) passed. Installed image `ghcr.io/callum-baillie/bord:v1.0.0-rc.30`, digest `sha256:7aa250d884b85cd4adef223350ec5dfa418ab6d2fa42a8ce56ec3da4c88808d1`, source revision `2620564b`. Companion `0.2.2-eee4450` is unchanged.

Bòrd and the companion were stopped for a recovery copy at `/mnt/cache/backups/bord/20261028-rc30` (SQLite backup: integrity `ok`, no foreign-key violations, 84 migrations; uploads, generated files, scanner-companion data and the previous compose file included). Only the image line of `compose.yaml` changed. After startup all 123 tables had identical row counts except `scanner_station_events` (75 → 77, written by the restart). The container's health endpoint reports rc.30 / schema 0082 / migrations current; both containers have zero restarts, Bòrd is healthy, the server log has no error entries, and the reader reconnected in ADD mode. Unauthenticated requests to `/pantry/add` redirect to sign-in and the photo route returns 401.

Not verified on Tower: a signed-in render of `/pantry/add` (the page that failed in rc.29), photos in a browser session, and the public HTTPS route (not reachable from the deploy host). Roll back by restoring `bord:v1.0.0-rc.28` in `compose.yaml` and recreating the service; no schema or data restore is needed.

## Known open items

GitHub's `verify` run for this commit is red: `native` fails TypeScript as in every earlier release, and `foundation` now fails at `pnpm test:post-review:browser`. Run locally against the built server, 18 of 23 post-review specs pass and 5 fail (`ai-completion` ×2, `post-review-chat`, `rv-action-review`, `settings-nutrition-completion`). The two inspected show messages that moved from inline text to the Notifications toasts; the other three were not inspected. The v1 oracle (fifteen specs) passes.
