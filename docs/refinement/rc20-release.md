# 1.0.0-rc.20 publication receipt

This authorized prerelease publishes the My Kitchen implementation on `refinement/post-review-completion`. It is not a stable v1 release and does not merge the branch into `main` or deploy to a household host. The K01–K30 completion status remains in the [acceptance register](../my-kitchen/acceptance.md).

## Candidate evidence

The release candidate passed `pnpm verify`, including 676 unit tests, 419 integration tests (9 skipped), OpenAPI validation/client smoke for 191 documented operations, formatting/lint/type checks, the release build and `diff:check`. The release browser suite passed 19 journeys plus 3 performance checks. Four My Kitchen production Chromium journeys passed for inventory, setup, session adaptation/exports and coordinated meals. Native typecheck/lint and 76 tests passed. Production dependency audit reported no known vulnerabilities. A disposable local amd64 Docker smoke passed non-root runtime, migrations, persistent restart and backup/restore/revocation/recovery checks.

The browser source digest is `374f2b7ed5431b9b6582a2af5b14c2975a00c68d099fa32cd55a34dc3567b0b4`; capture build ID `P-ymvTDBCP6zYaTfrOsxl`. The final `pnpm verify` standalone artifact build ID is `hQM493Xje2C7L3_P-EcAa`. The local Docker backup fixture was 59,582 bytes with SHA-256 `c33e26ab98fc06c5d1979401fd0b1de84227e00f4b7b4254c886c3fb5d1e6753`.

## GitHub release and image

Tag `v1.0.0-rc.20` starts the repository's existing release workflow. That workflow publishes `ghcr.io/callum-baillie/bord:v1.0.0-rc.20` as a multi-platform image and updates `latest`, then runs disposable smoke checks on native amd64 and arm64 GitHub runners. The local Docker pass is not a substitute for those published-image checks. Their final run links, result and image digest will be recorded here after completion.

The GitHub prerelease is the distribution event. It is not a deployment to the user's household or an Unraid/operator-host validation. Back up and validate household data before upgrading; migrations `0074`–`0080` are additive, but an older image must not be run against the migrated database.

## Remaining evidence limits

Several K01–K30 scenarios remain partial, including full adaptation-scope choices, richer batching/transitions, the complete nested/queued provider and cancellation matrix, native adaptation/device workflows, and broader model-specific provenance. No live model call, paid evaluation, native emulator/device run, production-volume restore, physical-device behavior or appliance safety/timing guarantee is claimed. See [My Kitchen verification](../my-kitchen/verification.md) for the exact test boundaries.
