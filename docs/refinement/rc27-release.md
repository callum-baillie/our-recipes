# RC27 continuous scanner connection fix

RC27 supersedes RC26. During final live observation, continuous scanner heartbeats reached the API-key quota even though they stayed below the configured per-minute allowance. The pinned API-key library updated its rate-window timestamp on every accepted request, so steady traffic could reset only after an idle minute.

The reproducible package patch preserves the first request as the window anchor, keeps the existing atomic increment guards and resets the counter when that window expires. It covers database and secondary-storage accounting. Dependency versions, schema, API keys, permissions and scanner queue bindings are unchanged. The API-key usage timestamp now represents the current window's first request (at most one configured window behind the last successful request).

The new real SQLite/Better Auth test fails against the original dependency, then passes with the patch: steady traffic across three windows succeeds; excess requests in each window are refused; a concurrent eight-request burst admits exactly three for a quota of three. All 767 unit tests and 528 integration tests pass (9 existing skips). Frozen install, standalone build/artifact validation, TypeScript and lint pass; existing PDF warnings remain. Docker installs copy and verify the same patch through pnpm's lockfile hash.

The built standalone rc.27 server also accepted 18 continuous authenticated HTTP requests across multiple five-second synthetic quota windows without an idle gap; all returned 200.

RC26's scanner/catalog/UI browser evidence remains applicable because this follow-up changes rate accounting and release metadata. Existing dependency advisories and the separate native-app TypeScript CI failure remain open. No paid OpenAI call or production stock mutation was submitted by the agent. User-originated scans arrived during RC26 observation: one saved and one required product review; these must remain in the production queue/history.

Deploy the versioned rc.27 image while keeping companion 0.2.1 and the current household/queue data. Back up the current state, including the newly observed scans, before the follow-up cutover. Do not restore the earlier pre-RC26 snapshot over those newer records. Schema remains 0082 / 84 migrations.

## Tower verification — 28 October 2026 UTC

The [rc.27 multi-architecture build and both container smoke checks](https://github.com/callum-baillie/our-recipes/actions/runs/40633628893) passed. Installed image index: `sha256:8435f12e6baadb359428b5708aa4068dec255971ff37e2872b42569b77d07564`; amd64 image: `sha256:ed17a9c6d74bb24517777b71ab495e7955dca2c2dd3a9e4f1901b924ec1284b0`, source `8d2eb11525d44a28d54a2e02064ff6d0784839d5`. Bòrd started at `2026-10-28T04:50:46Z`; companion 0.2.1 restarted at `04:51:00Z`.

All 123 household/account table fingerprints matched the fresh stopped backup at `/mnt/cache/backups/bord/20261028-rc27`; integrity is `ok`, foreign-key violations zero, schema0082 / 84 migrations current. Exact queue requests/results/captures and identity matched: three completed scans and one product review. Environments, mounts and devices are unchanged, as are food service container IDs and start times. HTTPS health, reader connectivity, ADD mode, authenticated station context and read-only exact catalog lookup pass. Both containers have zero restarts and Bòrd is Docker healthy.

A live observation spanned the quota expiry: the window anchor advanced from `1793163042` to `1793163103`, the counter reset from 555 to 19, and the final heartbeat age was 152ms. No new rate-limit warning appeared in the rc.27 server log. The delivery queue is empty; the unmatched product remains in review. This confirms recovery under continuous real heartbeats rather than an idle-gap reset.

The pre-RC27 image is retained as `bord:pre-rc27-20261028`. The fresh backup includes the newer user scans; do not overwrite them with the pre-RC26 copy. No restore was performed.
