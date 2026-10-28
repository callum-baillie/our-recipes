# RC27 continuous scanner connection fix

RC27 supersedes RC26. During final live observation, continuous scanner heartbeats reached the API-key quota even though they stayed below the configured per-minute allowance. The pinned API-key library updated its rate-window timestamp on every accepted request, so steady traffic could reset only after an idle minute.

The reproducible package patch preserves the first request as the window anchor, keeps the existing atomic increment guards and resets the counter when that window expires. It covers database and secondary-storage accounting. Dependency versions, schema, API keys, permissions and scanner queue bindings are unchanged. The API-key usage timestamp now represents the current window's first request (at most one configured window behind the last successful request).

The new real SQLite/Better Auth test fails against the original dependency, then passes with the patch: steady traffic across three windows succeeds; excess requests in each window are refused; a concurrent eight-request burst admits exactly three for a quota of three. All 767 unit tests and 528 integration tests pass (9 existing skips). Frozen install, standalone build/artifact validation, TypeScript and lint pass; existing PDF warnings remain. Docker installs copy and verify the same patch through pnpm's lockfile hash.

The built standalone rc.27 server also accepted 18 continuous authenticated HTTP requests across multiple five-second synthetic quota windows without an idle gap; all returned 200.

RC26's scanner/catalog/UI browser evidence remains applicable because this follow-up changes rate accounting and release metadata. Existing dependency advisories and the separate native-app TypeScript CI failure remain open. No paid OpenAI call or production stock mutation was submitted by the agent. User-originated scans arrived during RC26 observation: one saved and one required product review; these must remain in the production queue/history.

Deploy the versioned rc.27 image while keeping companion 0.2.1 and the current household/queue data. Back up the current state, including the newly observed scans, before the follow-up cutover. Do not restore the earlier pre-RC26 snapshot over those newer records. Schema remains 0082 / 84 migrations.
