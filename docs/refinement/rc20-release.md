# 1.0.0-rc.20 publication receipt

This authorized prerelease publishes the My Kitchen implementation on `refinement/post-review-completion`. It is not a stable v1 release and does not merge the branch into `main` or deploy to a household host. The K01–K30 completion status remains in the [acceptance register](../my-kitchen/acceptance.md).

## Candidate evidence

The release candidate passed `pnpm verify`, including 676 unit tests, 419 integration tests (9 skipped), OpenAPI validation/client smoke for 191 documented operations, formatting/lint/type checks, the release build and `diff:check`. The release browser suite passed 19 journeys plus 3 performance checks. Four My Kitchen production Chromium journeys passed for inventory, setup, session adaptation/exports and coordinated meals. Native typecheck/lint and 76 tests passed. Production dependency audit reported no known vulnerabilities. A disposable local amd64 Docker smoke passed non-root runtime, migrations, persistent restart and backup/restore/revocation/recovery checks.

The browser source digest is `374f2b7ed5431b9b6582a2af5b14c2975a00c68d099fa32cd55a34dc3567b0b4`; capture build ID `P-ymvTDBCP6zYaTfrOsxl`. The final `pnpm verify` standalone artifact build ID is `hQM493Xje2C7L3_P-EcAa`. The local Docker backup fixture was 59,582 bytes with SHA-256 `c33e26ab98fc06c5d1979401fd0b1de84227e00f4b7b4254c886c3fb5d1e6753`.

## GitHub release and image

The prerelease is [published on GitHub](https://github.com/callum-baillie/our-recipes/releases/tag/v1.0.0-rc.20) from commit `51ec3a1d824983b23720ba7742f7cb5fc576c22b` on `refinement/post-review-completion`. The [release workflow passed](https://github.com/callum-baillie/our-recipes/actions/runs/39859284821): native amd64 and arm64 builds, publication/finalize, and both published-image container smoke checks. The published version tag and `latest` resolve to OCI index digest `sha256:ea2891af3b75e80b8abfb55d21b30a7bead6a3703f9de6d0e469f71d922bc574`. Its linux/amd64 manifest is `sha256:84db899c6b6e3c4eb6661dfcf02f18533acf6e1879355c5bf12085b3f9098250`; linux/arm64 is `sha256:24ddb8c45fa1dd19f169d232371087115383271d299b66840d1bb5c758b2e1cc`. The local Docker pass is separate from these published-image checks.

The GitHub prerelease is the distribution event. It is not a deployment to the user's household or an Unraid/operator-host validation. Back up and validate household data before upgrading; migrations `0074`–`0080` are additive, but an older image must not be run against the migrated database.

## Remaining evidence limits

Several K01–K30 scenarios remain partial, including full adaptation-scope choices, richer batching/transitions, the complete nested/queued provider and cancellation matrix, native adaptation/device workflows, and broader model-specific provenance. No live model call, paid evaluation, native emulator/device run, production-volume restore, physical-device behavior or appliance safety/timing guarantee is claimed. See [My Kitchen verification](../my-kitchen/verification.md) for the exact test boundaries.
