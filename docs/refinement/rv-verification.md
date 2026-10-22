# RV completion verification receipt

Starting source: `45ed512b2d4909dac78ceb096d985dab85387d24`.
Branch: `refinement/rv-completion`, independent worktree.
Final framework/tool patch: Next16.4.1, Vitest4.1.12. Results below concern
this working patch. Publication and external deployment are separate.

## Executed gates

| Command                                                                                                                   | Result / scope                                                                                  |
| ------------------------------------------------------------------------------------------------------------------------- | ----------------------------------------------------------------------------------------------- |
| `PATH=/tmp/bord-refinement-bin:$PATH pnpm install --frozen-lockfile`                                                      | Passed with Node24.21.0/pnpm11.13.1; rerun after Vite8.1.6, Next16.4.1 and Vitest4.1.12 updates |
| `npx --yes npm@11.4.2 ci` in `mobile`                                                                                     | Passed from independent native lockfile; no primary-worktree dependencies modified              |
| `pnpm format:check`                                                                                                       | Passed; final evidence/doc formatting rerun pending                                             |
| `pnpm test:unit`                                                                                                          | 700 tests in120 files passed on Vitest4.1.12                                                    |
| `pnpm test:integration --maxWorkers=1`                                                                                    | Prior source run438 passed/9 skipped; patched-toolchain full rerun running                      |
| `pnpm typecheck`                                                                                                          | Passed on Next16.4.1 after correcting audit-status types and strictly typed fixture mocks       |
| `pnpm lint`                                                                                                               | Passed on the final Next16.4.1 ESLint configuration                                             |
| `pnpm openapi:validate`                                                                                                   | Passed:180 documented/generated-client operations; source route coverage checked                |
| `npx --yes npm@11.4.2 run typecheck`, `run lint`, `test` in `mobile`                                                      | Passed;75 tests in17 files. No physical-device claim                                            |
| `npx expo install --check`                                                                                                | Passed after aligning Navigation's declared Expo-compatible range                               |
| `npx expo export --platform ios --platform android --source-maps --max-workers 2 --output-dir /tmp/bord-rv-native-export` | Passed: iOS4.06MB and Android4.05MB Hermes bundles; source maps inspected separately            |
| `pnpm build:release`                                                                                                      | Passed on Next16.4.1:3,676 standalone files clean;7 runtime paths hydrated                      |
| `pnpm test:v1-release`                                                                                                    | Pending rebuilt production artifact                                                             |
| `pnpm test:post-review:browser`                                                                                           | Pending rebuilt production artifact; includes both new RV browser specs                         |
| `pnpm diff:check`                                                                                                         | Pending final gate                                                                              |

Individual RV test scenarios and focused results are in [rv-catalog.md](rv-catalog.md),
[rv-ai.md](rv-ai.md), [rv-reviews.md](rv-reviews.md) and [rv-images.md](rv-images.md).
New unit/integration files are collected by existing CI globs. New RV browser
specs are explicitly included in the CI-invoked post-review runner. Native's new
shared-review case is included in its existing test glob.

## Failed/interrupted iterations retained honestly

- The first full integration invocation used the default4 workers while root and
  native types plus concurrent unrelated work were running. Its real-auth setup
  exceeded30s, and the run was intentionally interrupted (exit130). It is not a
  pass. The serial full rerun passed438/9 skips before the fresh dependency advisories. Another serial run covers the patched framework and added review case.
- The same run exposed a historical schema-rewind fixture whose parser recognizes
  `ADD COLUMN`; new unpublished0075 initially used the equivalent `ADD` syntax.
  The new migration now uses `ADD COLUMN`, allowing that fixture to rewind it.
  No applied historical SQL was changed.
- The first release build reached TypeScript before the final fixture mock ID correction and failed that gate. It produced no accepted release artifact; the corrected-source rebuild is the acceptance run.
- Initial type checks found the newly meaningful audit statuses missing from the
  TypeScript/Zod status union and strict fixture mock/required-field errors. These
  were corrected rather than skipped or cast away.
- The first OpenAPI lint rejected two unquoted comma-containing YAML descriptions.
  They were corrected; full lint/coverage/client generation then passed.

## Independent security review

The required fresh read-only review inspected immutable patch
`83a174babcd7e812eea8acb52d7290d546150ffd1a7768e499c4b66b84194d60` and connected callers.
It found the scheduled-thread baseline regression, cached round-cap issue and
post-upload Batch revocation window, plus image retry configuration drift. The
lead confirmed these paths. Corrections add trustworthy baseline seeding before
evidence, current round-cap checks, required Batch boundary checks with definite
not-started versus uncertain-paid outcomes, and preservation of approved image
retry options. Controlled regressions verify the corrected outcomes. This is a
bounded source/bypass review, not a general security certification.

## External acceptance still blocked

| Required check                                                      | Missing prerequisite and exact acceptance path                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                             |
| ------------------------------------------------------------------- | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Six-dish realism and live model/tool choice                         | Explicit paid allowance and operator-provided credentials are absent. After allowance, use `BORD_PAID_IMAGE_EVAL_AUTHORIZED=yes pnpm exec tsx scripts/evaluate-recipe-images.ts --paid --model gpt-image-2 --quality low --size 1024x1024 --max-images 6 --output /tmp/bord-image-eval-UNIQUE`; inspect all six images using `tests/fixtures/ai/image-realism.json` and the rubric in `recipe-images.md`, recording model/options/prompt and human scores. For tool choice, use the five synthetic workflows in the mission through the authorized assistant on an isolated household, recording proposals, exact requests, outcomes and actual model. Do not use a dry-run/null score as quality evidence |
| Native physical scanner/storage restart/accessibility/login handoff | `adb devices` is empty; no emulator/sdkmanager/xcrun is installed. Supply an Android SDK+AVD or physical device (and macOS/Xcode for iOS). Install the current app; scan/import/rescan local500g, kill after confirmation commit/before response, restart and inspect/close under same and switched account/profile. Verify exactly one batch, VoiceOver/TalkBack, dynamic text, keyboard/safe areas and OS login handoff                                                                                                                                                                                                                                                                                  |
| Physical passkey and live reset email                               | Synthetic Better Auth/session and Chromium virtual-authenticator checks do not prove a real authenticator or delivered mail. Supply an authorized test identity, real RP/origin and test inbox; enroll/remove, revoke/reset, reject replay and verify remaining recovery access without exposing account existence                                                                                                                                                                                                                                                                                                                                                                                         |
| Installed PWA                                                       | Supply a headful installed-app environment and isolated HTTPS instance. Verify cached/uncached pages, offline/no queued writes, online-but-server-unreachable recovery, and dirty-form update deferral versus explicit clean reload. Controlled browser registration fixtures are not installed-PWA evidence                                                                                                                                                                                                                                                                                                                                                                                               |
| Live food provider/worker/source packs                              | Supply a configured authorized provider and active packs plus worker. Repeat reviewed exact-revision scan/cart/Pantry and delayed execution checks using synthetic household data; distinguish absent pack from failure. Do not acquire/crawl sources as setup                                                                                                                                                                                                                                                                                                                                                                                                                                             |
| Operator-volume Unraid upgrade/restore                              | Supply disposable copies of actual operator volumes and the deployment configuration. Integrate both unpublished migration branches first; validate upgrade/rollback, guarded restore credential denial and restart against those copies. Retain prior rc.19 amd64/arm64 publication evidence; it is not this deployment acceptance                                                                                                                                                                                                                                                                                                                                                                        |
| Historical migration archives                                       | `T136_SURFACE_DB`, `T136_BOTH_DB`, `T140_INCIDENT_DB`, `T139_PREFIX_DB` are unavailable on this Linux host (historical evidence references old Windows paths). Supply sanitized consistent archive copies, set those variables to the copies, and run `pnpm exec vitest run --project integration tests/integration/migration-lineage-recovery.test.ts`. Nine optional archive skips remain unverified                                                                                                                                                                                                                                                                                                     |
| Dependency closure                                                  | The required braces patch is unpublished upstream, and native Expo/Router/build-chain patches are not available within the current supported ranges. Follow [rv-dependencies.md](rv-dependencies.md); bundled decoder evidence is retained, with no forced incompatible override                                                                                                                                                                                                                                                                                                                                                                                                                           |

## Migration integration before deployment

This isolated branch contains0075, while concurrent My Kitchen reserves0074 in
the original checkout. Integrate and order both unpublished migrations before
release publication/deployment. Do not deploy0075 and later append an older timestamped
0074: the timestamp migrator would skip it. Reconcile the merged journal's actual
length with `EXPECTED_MIGRATION_COUNT` and rerun fresh/upgrade/health tests. No
primary migration or unrelated work has been altered here.
