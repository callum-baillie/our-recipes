# RC21 integration receipt

`v1.0.0-rc.21` integrates the RC20 My Kitchen release on `main` with the four outstanding `refinement/rv-completion` commits. It keeps the RC20 kitchen catalog, inventory, cooking plans, session snapshots and native workflows while adding the reviewed-operation, privacy-boundary, scanner-recovery and modal-focus fixes from RV completion. The integration adds migration `0081_ai_chat_privacy_scope`; it does not rewrite any applied migration.

The integration also restores the VeSync onboarding cookie pass-through removed by the latest DevBox reconciliation. That cookie is required by the existing setup service to complete a scale connection. The reconciliation's partial PIN change was rolled back to the existing passphrase contract: it had changed one test and an error message without changing enrollment, schema, switching API or UI, and conflicted with the existing auth-domain test. The stale cooking browser stub now delays and then reaches the real session endpoint, so the test exercises persisted-session navigation.

## Verification

On Node 24.21.0 and pnpm 11.13.1:

- `pnpm verify` passed: Prettier, ESLint, TypeScript, 121 unit files / 707 tests, 75 integration files / 483 tests (9 skipped), OpenAPI validation and generated-client smoke, standalone release build and whitespace checks. The standalone artifact contains 3,727 files. OpenAPI covers 192 documented operations and 69 explicitly internal routes; Redocly reports one unused `AiAppActionReviewMetadata` schema warning.
- `pnpm test:v1-release` passed 19 production Chromium journeys and 3 performance checks.
- `pnpm test:post-review:browser` passed 23 Chromium journeys plus the separate real-handler passkey journey. My Kitchen's four production Chromium scenarios passed inventory duplicate/edit/draft recovery, guided setup, session-only adaptation, and coordinated dinner conflict/reallocation/active-use recovery. Captures are tied to [the RC21 source manifest](rc21-source-manifest.json) and the standalone build ID in each screenshot manifest.
- Native checks passed: `npm ci`, Prettier, Expo lint, TypeScript, 20 test files / 81 tests, and iOS plus Android Expo exports. These are toolchain and bundle checks, not emulator/device evidence.
- `pnpm audit --prod --audit-level=moderate` reported no known web production vulnerabilities. Native `npm audit --omit=dev` still reports 25 Expo/React Native transitive advisories (22 high, 3 moderate), the same set present in the `origin/main` lockfile. npm only offered major SDK downgrades/upgrades for those paths; no forced dependency migration was applied.
- `pnpm test:docker` passed against a disposable local amd64 image at version `1.0.0-rc.21`, schema `0081_ai_chat_privacy_scope`: non-root runtime, clean runtime paths, backup creation/download/validation/restore, restored-session revocation, persistent restart and interrupted-recovery blocking. Backup fixture: 59,652 bytes, SHA-256 `b6168aec61178966b3f5886a227285ce1813d3370bb9d5e3c5aeefc6c31bf1b1`.

The focused My Kitchen scenarios use a synthetic household and no live AI or food-provider calls. No real hardware behavior, provider language quality, native emulator/device accessibility, production household volume, operator host or Unraid recovery is established here. The [K01–K30 register](../my-kitchen/acceptance.md) remains authoritative and explicitly marks unfinished scenarios partial; this release candidate does not claim every requirement is complete.

## Release contents

- Version: `1.0.0-rc.21`.
- Schema: `0081_ai_chat_privacy_scope` (83 applied migrations expected).
- Base: current `origin/main` at `18da8cb`, with `origin/refinement/rv-completion` at `8995acb` integrated and conflicts resolved against the RC20 migration chain and newer dependencies.
- The release tag, GitHub publication receipt, final commit and any hosted release-workflow result are appended after publication.
