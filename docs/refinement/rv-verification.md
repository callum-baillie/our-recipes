# RV completion verification receipt

Starting source: `45ed512b2d4909dac78ceb096d985dab85387d24`.
Branch: `refinement/rv-completion`, independent worktree.
Final implementation: `f2ff37c9a630fed809719f6db885385fff7b8efe`.
Final framework/tool patch: Next 16.4.1, Vitest 4.1.12. Results below concern
this working patch. Publication and external deployment are separate.

## Executed gates

| Command                                                                                                                         | Result / scope                                                                                                                                            |
| ------------------------------------------------------------------------------------------------------------------------------- | --------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `pnpm install --frozen-lockfile`                                                                                                | Passed locally and in clean final-source CI; pinned pnpm 11.13.1                                                                                          |
| `npx --yes npm@11.4.2 ci` in `mobile`                                                                                           | Passed independently; final-source native CI uses the pinned npm version                                                                                  |
| `pnpm format:check`                                                                                                             | Passed; final narrative/capture formatting is checked again before the evidence commit                                                                    |
| `pnpm lint`, `pnpm typecheck`                                                                                                   | Passed on final implementation in CI; scoped hook lint also passed locally                                                                                |
| `pnpm test:unit`                                                                                                                | 702 passed in 120 files locally and in CI on `f2ff37c`; local 69.56s                                                                                      |
| `pnpm test:integration`                                                                                                         | 440 passed,9 skipped in 72 files in final-source CI; unavailable historical archives are not passes                                                       |
| `pnpm test:integration --maxWorkers=1`                                                                                          | Earlier local run:439 passed/9 skipped before the additional account-binding case;504.19s                                                                 |
| `pnpm exec vitest run --project integration tests/integration/rv-pantry-recovery.test.ts`                                       | Final focused 13/13 real-auth confirmation cases passed locally, including the new account-binding case                                                   |
| `pnpm openapi:validate`                                                                                                         | Passed: 180 documented/generated-client operations;69 explicitly internal operations checked; typed candidate outcome and optional actor headers included |
| `npx --yes npm@11.4.2 run typecheck`, `run lint`, `test` in `mobile`                                                            | Passed; 75 tests in 17 files; clean final-source native CI also passed formatting                                                                         |
| `npx expo install --check`                                                                                                      | Passed after aligning Navigation's Expo-compatible range                                                                                                  |
| `npx expo export --platform ios --platform android --source-maps --max-workers 2 --output-dir /tmp/bord-rv-native-export-final` | Passed; 4.06MB iOS/4.05MB Android Hermes bundles, source maps inspected. Both exports also passed final-source CI                                         |
| `pnpm build:release`                                                                                                            | Passed; 3,676 standalone files clean,7 runtime paths hydrated; Next 16.4.1                                                                                |
| `pnpm test:v1-release`                                                                                                          | 19 browser +3 performance checks passed locally and in final-source CI on `f2ff37c`                                                                       |
| `pnpm test:post-review:browser`                                                                                                 | 24 passed on `f2ff37c`: 23 main +1 isolated virtual-authenticator case, locally and in CI                                                                 |
| `DOCKER_IMAGE=bord:rv-f2ff37c DOCKER_SMOKE_PORT=3911 pnpm test:docker`                                                          | Passed on a disposable synthetic bind mount; local linux/amd64, not operator-volume or current arm64 acceptance                                           |
| `pnpm diff:check`                                                                                                               | Passed; repeated after final evidence formatting                                                                                                          |

Individual RV test scenarios and focused results are in [rv-catalog.md](rv-catalog.md),
[rv-ai.md](rv-ai.md), [rv-reviews.md](rv-reviews.md) and [rv-images.md](rv-images.md).
New unit/integration files are collected by existing CI globs. New RV browser
specs are explicitly included in the CI-invoked post-review runner. Native's new
shared-review case is included in its existing test glob.

## Failed/interrupted iterations retained honestly

- The first full integration invocation used the default 4 workers while root and
  native types plus concurrent unrelated work were running. Its real-auth setup
  exceeded 30s, and the run was intentionally interrupted (exit 130). It is not a
  pass. The serial full rerun passed 438/9 skips before the fresh dependency advisories. Another serial run covers the patched framework and added review case.
- The same run exposed a historical schema-rewind fixture whose parser recognizes
  `ADD COLUMN`; new unpublished 0075 initially used the equivalent `ADD` syntax.
  The new migration now uses `ADD COLUMN`, allowing that fixture to rewind it.
  No applied historical SQL was changed.
- The first release build reached TypeScript before the final fixture mock ID correction and failed that gate. It produced no accepted release artifact; the corrected-source rebuild is the acceptance run.
- Initial type checks found the newly meaningful audit statuses missing from the
  TypeScript/Zod status union and strict fixture mock/required-field errors. These
  were corrected rather than skipped or cast away.
- The first OpenAPI lint rejected two unquoted comma-containing YAML descriptions.
  They were corrected; full lint/coverage/client generation then passed.

- The first fresh post-review browser suite at `a0a0f2c` passed 21 cases and
  failed 2: a real focus/auto-follow defect at 320px/200% text, plus a scan fixture
  that had not opened Shopping tools. It did not pass and stopped before the
  isolated auth suite. The source focus correction and actual disclosure
  interaction now pass all 24 cases. A before capture is retained separately.
- Final account-binding fixture initially encountered the existing product-name
  conflict in its positive catalog case. Only synthetic product names changed;
  no domain rule was weakened. All13 real-auth confirmation cases passed.

- Final-source CI at `fd6d35e` passed types/unit/integration/API/build, then
  failed standard mobile focus wrap. The retained screenshot showed deferred
  initial placement resetting a completed Shift+Tab. A deterministic queued-frame
  regression also failed before correction. `useModalSurface` now preserves a
  valid focused child; all 7 modal cases and the full standard/post-review browser
  gates pass at `f2ff37c`. This was a source correction, not a retry-only pass.

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

| Required check                                                      | Missing prerequisite and exact acceptance path                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                           |
| ------------------------------------------------------------------- | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Six-dish realism and live model/tool choice                         | No explicit paid allowance has been granted for this pass; live credential readiness is unverified. After allowance, use `BORD_PAID_IMAGE_EVAL_AUTHORIZED=yes pnpm exec tsx scripts/evaluate-recipe-images.ts --paid --model gpt-image-2 --quality low --size 1024x1024 --max-images 6 --output /tmp/bord-image-eval-UNIQUE`; inspect all six images using `tests/fixtures/ai/image-realism.json` and the rubric in `recipe-images.md`, recording model/options/prompt and human scores. For tool choice, use the five synthetic workflows in the mission through the authorized assistant on an isolated household, recording proposals, exact requests, outcomes and actual model. Do not use a dry-run/null score as quality evidence |
| Native physical scanner/storage restart/accessibility/login handoff | `adb devices` is empty; no emulator/sdkmanager/xcrun is installed. Supply an Android SDK+AVD or physical device (and macOS/Xcode for iOS). Install the current app; scan/import/rescan local500g, kill after confirmation commit/before response, restart and inspect/close under same and switched account/profile. Verify exactly one batch, VoiceOver/TalkBack, dynamic text, keyboard/safe areas and OS login handoff                                                                                                                                                                                                                                                                                                                |
| Physical passkey and live reset email                               | Synthetic Better Auth/session and Chromium virtual-authenticator checks do not prove a real authenticator or delivered mail. Supply an authorized test identity, real RP/origin and test inbox; enroll/remove, revoke/reset, reject replay and verify remaining recovery access without exposing account existence                                                                                                                                                                                                                                                                                                                                                                                                                       |
| Installed PWA                                                       | Supply a headful installed-app environment and isolated HTTPS instance. Verify cached/uncached pages, offline/no queued writes, online-but-server-unreachable recovery, and dirty-form update deferral versus explicit clean reload. Controlled browser registration fixtures are not installed-PWA evidence                                                                                                                                                                                                                                                                                                                                                                                                                             |
| Live food provider/worker/source packs                              | Supply a configured authorized provider and active packs plus worker. Repeat reviewed exact-revision scan/cart/Pantry and delayed execution checks using synthetic household data; distinguish absent pack from failure. Do not acquire/crawl sources as setup                                                                                                                                                                                                                                                                                                                                                                                                                                                                           |
| Operator-volume Unraid upgrade/restore                              | Supply disposable copies of actual operator volumes and the deployment configuration. Integrate both unpublished migration branches first; validate upgrade/rollback, guarded restore credential denial and restart against those copies. Retain prior rc.19 amd64/arm64 publication evidence; it is not this deployment acceptance                                                                                                                                                                                                                                                                                                                                                                                                      |
| Historical migration archives                                       | `T136_SURFACE_DB`, `T136_BOTH_DB`, `T140_INCIDENT_DB`, `T139_PREFIX_DB` are unavailable on this Linux host (historical evidence references old Windows paths). Supply sanitized consistent archive copies, set those variables to the copies, and run `pnpm exec vitest run --project integration tests/integration/migration-lineage-recovery.test.ts`. Nine optional archive skips remain unverified                                                                                                                                                                                                                                                                                                                                   |
| Dependency closure                                                  | The required braces patch is unpublished upstream, and native Expo/Router/build-chain patches are not available within the current supported ranges. Follow [rv-dependencies.md](rv-dependencies.md); bundled decoder evidence is retained, with no forced incompatible override                                                                                                                                                                                                                                                                                                                                                                                                                                                         |

## Migration integration before deployment

This isolated branch contains 0075, while concurrent My Kitchen reserves 0074 in
the original checkout. Integrate and order both unpublished migrations before
release publication/deployment. Do not deploy 0075 and later append an older timestamped
0074: the timestamp migrator would skip it. Reconcile the merged journal's actual
length with `EXPECTED_MIGRATION_COUNT` and rerun fresh/upgrade/health tests. No
primary migration or unrelated work has been altered here.

## Browser and visual evidence

Final `pnpm test:post-review:browser` at `f2ff37c` used Chromium against the standalone
production server, real authentication/trusted-origin checks and synthetic data.
Costly/unknown/provider states are controlled. Barcode lookup alone is intercepted
in the scan scenario; confirmation, recovery inspection/closure and persisted list
reads use real handlers/SQLite. No real account, household or paid provider changed.

| Capture set                                                                        | Tested states and direct inspection                                                                                                                                                                                                                                          |
| ---------------------------------------------------------------------------------- | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| [Named action review](../../screenshots/rv-completion/action-review/evidence.json) | 1440×1000,390×844,320×568 with 200% text; named meal/date/slot/servings, fully visible keyboard-focused confirmation, local409. Desktop and enlarged-text PNGs inspected directly                                                                                            |
| [Scan review/recovery](../../screenshots/refinement/rv/shopping-scan/source.json)  | 1440×1000,390×844,320×844;500g→1g replacement versus2each demand, separate500g row, unknown receipt inspection, saved-list handoff and explicit closure.390px review and 320px recovery PNGs inspected directly; dialog axe reports no violations in these fixtures          |
| [Before focus correction](../../screenshots/rv-completion/before/evidence.json)    | Actual failing320×568/200% state at `a0a0f2c`, distinctly labelled before; not a supplied baseline                                                                                                                                                                           |
| Existing post-review sets                                                          | Chat running/stopped/unknown/retry/jump/failed states at desktop,390,320/200%,390×500 and 568×320; long reviews, settings, onboarding, source portions, images, offline/update and virtual passkey scenarios recaptured by the runner. 390px running chat inspected directly |

These checks establish the stated interactions and fixture-level scanner results,
not full WCAG conformance, native screen-reader behavior or physical-camera
acceptance. All 216 original `screenshots/bord` files remain untouched. Actual PDF
rendering code is unchanged by this patch; retained export integration checks pass,
without claiming fresh visual approval of every PDF. No live generated-image
quality check was run.

The source/capture scope is pinned by `rv-evidence/tested-source.json`. Narrative
and OpenAPI documentation may follow the implementation commit; no runtime source
changes are hidden in the evidence-only handoff.

## Final source CI and isolated container

[GitHub verify39828959519](https://github.com/callum-baillie/our-recipes/actions/runs/39828959519)
passed both foundation and native for `f2ff37c`. Foundation ran frozen installation,
formatting, lint, types, 702 unit cases, 440 integration cases/9 archive skips,
180-operation API/client validation, production build, 19 release browser +3
performance checks and 24 post-review browser cases. Native ran its pinned npm
clean install, formatting/lint/types, 75 cases and both platform exports. The
[immutable job receipt](rv-evidence/ci-f2ff37c.json) records the source and steps.

`DOCKER_IMAGE=bord:rv-f2ff37c DOCKER_SMOKE_PORT=3911 pnpm test:docker` passed
against a uniquely named local image and disposable synthetic bind mount. It
checks UID1001, clean runtime paths, fresh setup, restart persistence, backup
creation/download/validation/restore, revoked restored sessions and incomplete
restore denial at runtime/startup. The container/volume were removed by the
harness. This does not establish operator-volume compatibility or Unraid
acceptance. API-key and interrupted-database cases retain separate integration
evidence; the Docker boolean for sessions is not relabelled API-key coverage.

The image is local `linux/amd64`, ID
`sha256:afc11c0d6e3ee4c235386aa64ab151e447095d00e318c86eb12aeb11bc3e2e50`.
A direct read inside it reports Node 24.22.1 and Next 16.4.1. Host checks used
Node 24.21.0. See [docker-smoke.json](rv-evidence/docker-smoke.json). No image was
pushed and no new release tag/deployment was created; historical rc.19 amd64/arm64
publication remains separate.

ADB was rechecked: no device attached; emulator/sdkmanager/xcrun are unavailable
and the usual Android SDK root is absent. The device prerequisites above remain
real blockers. No paid/model/image-quality run or null-score substitute occurred.
