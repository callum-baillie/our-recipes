# Refinement verification evidence

Starting revision: `a278f81a272472b9ee2da6ff7c55788285c6fb4c`; branch `refinement/full-project-completion`. This receipt is updated after the final gates. Local changes, GitHub publication and deployment are separate states.

## Current executed gates

| Command / evidence                                                            | Result                                                                                                                                                                                                                                                                                                                                 |
| ----------------------------------------------------------------------------- | -------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `pnpm install --frozen-lockfile` with the old root `node_modules` moved aside | Passed; 683 packages installed from the lockfile                                                                                                                                                                                                                                                                                       |
| `pnpm test:unit`                                                              | 607 passed across 103 files                                                                                                                                                                                                                                                                                                            |
| `pnpm test:integration`                                                       | 331 passed, 9 skipped across 56 files                                                                                                                                                                                                                                                                                                  |
| `pnpm typecheck`                                                              | Passed after typed fixture reconciliation                                                                                                                                                                                                                                                                                              |
| `pnpm openapi:validate`                                                       | Passed; 174 documented operations and70 explicitly internal operations; generated-client smoke174                                                                                                                                                                                                                                      |
| Native `npm ci`, lint, typecheck, tests                                       | Passed after clean install; 46 tests across 12 files, including shared progressive stream and safe-message rendering                                                                                                                                                                                                                   |
| Native Expo iOS and Android export                                            | Both bundled after clean install; 6.26MB per platform                                                                                                                                                                                                                                                                                  |
| Focused Chromium workflows/settings/images/catalog/chat                       | 14 cases passed (2 workflow +12 AI/catalog/offline/Pantry/image/settings); controlled responses, current screenshots and scoped axe/keyboard checks                                                                                                                                                                                    |
| PDF fixture generation                                                        | 5 integration cases pass; 8 A4/Letter documents, 38 pages                                                                                                                                                                                                                                                                              |
| PDF visual inspection                                                         | All38 rendered pages inspected with Poppler. Long recipes, dense/custom/adapted meal sections across a year boundary, partial section, Pantry batch/date/quantity states, shopping completion/cart/cannot-find/unknown amount and footers remain readable. This is actual document evidence, separate from embedded viewer screenshots |
| `pnpm verify` (clean root install)                                            | Passed formatting, lint, types, unit/integration, OpenAPI, production build, artifact and whitespace gates                                                                                                                                                                                                                             |
| Production release artifact                                                   | Clean; 3568 files inspected                                                                                                                                                                                                                                                                                                            |
| `pnpm test:v1-release` production browser/performance oracle                  | 19 Chromium release journey tests across 15 specs and 3 performance tests passed on the final rebuilt implementation                                                                                                                                                                                                                   |

The final shared-dialog and first-install update corrections were rebuilt before the 14-case focused browser rerun. All 14 passed. The complete release browser oracle then passed on the same production artifact.

The9 integration skips require optional externally supplied legacy/incident database archives (`migration-lineage-recovery.test.ts`). Synthetic clean installation, representative upgrade, lineage rejection and recovery fixtures executed successfully; missing external archives are not counted as passes.

The matching pnpm 11.13.1 CLI was used through a temporary PATH wrapper because the host's cached launcher was corrupt. Repository commands/lockfile were preserved. Native uses its independent npm lockfile. Test providers are deterministic; no live paid calls, emails, provider acquisition, scale sync, credential rotation, real household writes or production recovery were used.

## Dependency audit

`pnpm audit --prod --json`: zero production advisories at this check. Root tooling audit fell from 13 advisories to one high advisory after SVGO4.1.0 and major-compatible brace-expansion1.1.21/5.0.12 overrides. The remaining `braces<=3.0.3` advisory is through Next's ESLint/fast-glob tooling; the registry still publishes3.0.3, while the advisory requires3.0.4. It is not counted as resolved or as a production dependency. Native's separate30-advisory limit remains below.

## Visual evidence

- `screenshots/full-refinement/before/`: fresh isolated starting-revision views at 1440×1000 and390×844, full pages for Today, Diary, Account, shared AI administration, Profiles and Stores. This is a separate synthetic household, not the old216-image archive.
- `screenshots/full-refinement/after/`: current corresponding full pages. Its synthetic household contains additional test people/products, stated in the manifest; pixel differences are not all implementation changes.
- `screenshots/full-refinement/settings/`: switches, measurement errors/short viewport, interview drafts, onboarding type/name/completion, conflicts, guardian controls and copied destination.
- `screenshots/full-refinement/workflow/`, `images/`, `ai/`: long reviews, entered-work protection, photo candidates, prompt conflicts and progressive chat/recovery. Additional Pantry recovery images are indexed with these fixtures.
- `screenshots/refinement/catalog-native/`: source/revision/measures/guidance/retail/store and uncertain-import states.
- `screenshots/full-refinement/documents/`: actual synthetic PDF files and page-count manifest.

The Browser plugin/skill was not available; the checked-in Playwright Chromium workflow was used. The12-case focused run logged one Next.js destination-stream closure during navigation teardown; all interactions passed and no client error overlay was reported. This is not counted as proof of a live-provider cancellation outcome.

The controlled offline checks inject update/controller events and health/destination responses; worker VM/unit checks cover activation behavior. They do not establish a deployed service-worker update across real installed devices. No queued writes are introduced.

Captures identify the base revision plus current working source state. Final code revision is added at publication. Historical `screenshots/bord` files remain historical baseline evidence and are not relabelled as new captures. Representative checks cover1440/390/320, intermediate850px, short390×500/560 and landscape568×320, and200% text; individual manifests/tests state their exact coverage. Scoped axe and keyboard checks do not establish blanket WCAG2.2AA conformance or native assistive-technology completion.

## External or unexecuted acceptance limits

- No Android device/emulator or iOS simulator is available (`adb devices -l` is empty). Native camera, keyboard/safe areas, SecureStore lifecycle, dynamic type, VoiceOver/TalkBack and real login/logout remain unverified despite unit/type/export evidence.
- Live passkey ceremonies, real recovery-email delivery, production reverse-proxy/RP configuration and native platform auth require their configured environment. Actual library/session/object-scope tests use synthetic accounts and no outgoing mail.
- No explicit paid-call permission was given. Live image realism and live model/tool-selection quality are blocked; deterministic fixtures and a reproducible image evaluation rubric are delivered.
- Native installation still has30 upstream advisories (22 high, 8 moderate; zero critical) after compatible remediation. A separately verified supported Expo upgrade or upstream fixes remain required.
- No Docker/Unraid deployment, real provider/source-pack activation, production worker health, actual printer job or real installation backup/restore/reset is claimed. Synthetic migrations/backup tests and the release artifact have their own recorded scope.
- The separate `bord-food-api` checkout was read at `0fc10f8…`; its unrelated dirty acquisition/docs work was preserved. No acquisition/crawl was activated or provider change published.

## Reproducing the executed checks

Run in a disposable local checkout/test-data directory with Node 24 and the checked-in package managers. `prepare-e2e` replaces synthetic `.test-data`; it is not a production migration command. Root installation and the native installation are independent.

```sh
pnpm install --frozen-lockfile
pnpm verify
pnpm exec tsx scripts/prepare-e2e.ts
V1_RELEASE_ORACLE=true pnpm exec playwright test tests/e2e/workflow-backlog.spec.ts --workers=1
V1_RELEASE_ORACLE=true pnpm exec playwright test tests/e2e/ai-completion.spec.ts tests/e2e/catalog-native-refinement.spec.ts tests/e2e/pantry-add-recovery.spec.ts tests/e2e/recipe-image-review.spec.ts tests/e2e/settings-nutrition-completion.spec.ts tests/e2e/offline-update-refinement.spec.ts --workers=1
pnpm test:v1-release
BORD_PDF_EVIDENCE=/tmp/bord-pdf-evidence pnpm exec vitest run --project integration tests/integration/pdf-export-refinement.test.ts
```

The workflow fixture runs first to create the named synthetic account used by the focused fixtures. Focused fixtures reuse its in-memory session instead of weakening authentication rate limits; only an explicitly refused429 sign-in may retry once after its actual `Retry-After`. The release oracle separately exercises the real sign-in/onboarding journey.

From `mobile/`:

```sh
npm ci
npm run format:check
npm run lint
npm run typecheck
npm test
npx expo export --platform ios --platform android --output-dir /tmp/bord-native-export
```

Local logs are retained under `/tmp/bord-full-refinement`; committed capture manifests and executable tests provide the durable evidence. GitHub Actions reruns the independent web/native gates after publication; local success is not described as a remote CI result.

## Rendered QA scope

| Check                                | Executed evidence                                                                                                                                                                                                       |
| ------------------------------------ | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Page identity and meaningful content | Route/title/heading assertions and real data flows in the production release and focused Chromium suites                                                                                                                |
| Framework overlays                   | None in the inspected current captures; this does not replace every-route runtime monitoring                                                                                                                            |
| Console/server health                | Controlled409/503 failures are intentional. One Next destination-stream teardown warning is retained above; catalog/chat fixtures check their client errors. No blanket zero-error claim is made for unexercised routes |
| Interaction proof                    | Actual keyboard navigation, native dialogs, scoped axe, entered-work retention, late/uncertain responses, reviewed operations and destination links                                                                     |
| Visual evidence                      | Fresh baseline/current full pages, current interaction manifests and separately inspected generated PDFs; device and live-provider limits remain explicit                                                               |

Prompt, model and image quality were evaluated deterministically for contracts. Only a separately permitted live evaluation can establish real provider quality or photographic realism.

## Implementation and publication receipt

Tested implementation and captured-evidence commit: [`3cb08576150147a600f757951c0cbe66af8010de`](https://github.com/callum-baillie/our-recipes/commit/3cb08576150147a600f757951c0cbe66af8010de). The following receipt commit changes documentation and evidence labels only.

GitHub publication target: [`refinement/full-project-completion`](https://github.com/callum-baillie/our-recipes/tree/refinement/full-project-completion). The branch contains the three additive migrations and all reported implementation/tests/captures. No merge, release tag, production migration or deployment was performed. Remote CI status is reported separately from these executed local gates.

### Clean GitHub runner correction

The [first published verification run](https://github.com/callum-baillie/our-recipes/actions/runs/39454717753) passed the native job and root formatting/lint/types/unit gates, then failed five PDF tests because `pdftotext` was absent (`ENOENT`). CI now explicitly installs `poppler-utils`; local PDF assertions remain unchanged and are rerun. This follow-up changes CI prerequisites and documentation only. The final GitHub run remains separate execution evidence from the local pass.
