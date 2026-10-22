# Remaining refinement completion

## Baseline and isolation

Started from `45ed512b2d4909dac78ceb096d985dab85387d24` on
`refinement/rv-completion` in the independent `our-recipes-rv-completion`
worktree. The original `refinement/post-review-completion` worktree contains
concurrent My Kitchen work and has not been edited, reset, stashed or copied into
this branch. The named 20261021 review file was not available locally; this pass
uses the self-contained RV requirements supplied by the user.

The rc.19 release and its amd64/arm64 publication evidence remain historical
evidence, documented in [rc19-release.md](rc19-release.md). This pass does not
establish acceptance on an operator's deployment.

## Register

| ID   | Owner          | Affected surfaces and acceptance                                                                                | Status      | Implementation / evidence                                    |
| ---- | -------------- | --------------------------------------------------------------------------------------------------------------- | ----------- | ------------------------------------------------------------ |
| RV01 | Catalog/native | Web scan uses reviewed confirmation; purchase dimension stays separate from demand; persisted cart/intake check | in progress | `rv-catalog.md` on completion                                |
| RV02 | Catalog/native | Durable local Pantry receipts, actor/intent checks, restart/expiry replay and explicit unknown-outcome recovery | in progress | `rv-catalog.md` on completion                                |
| RV03 | Catalog/native | Local barcode product succeeds without remote alternatives, including provider outage                           | in progress | `rv-catalog.md` on completion                                |
| RV04 | AI execution   | Current sharing checked before every request; later serialized rounds cannot resend revoked cached context      | in progress | `rv-ai.md` on completion                                     |
| RV05 | AI execution   | Scheduled execution preserves approved model/prompt/options; current revocations stop execution                 | in progress | `rv-ai.md` on completion                                     |
| RV06 | AI execution   | Same-model revoked reasoning blocked in direct and Batch paths                                                  | in progress | `rv-ai.md` on completion                                     |
| RV07 | Reviews        | Shared authoritative target/context/before-after review; stale named-meal deletion denied                       | in progress | `rv-reviews.md` on completion                                |
| RV08 | Root           | Candidate/job/item/audit terminal states agree; uncertainty and discard remain distinct                         | in progress | `ai-job-service.ts`; focused persistence regressions pending |
| RV09 | Reviews        | Image action says prepare preview and explains separate acceptance                                              | in progress | `ai-app-action-service.ts`; wording verification pending     |

## Retained scope

The 33 original B findings and their existing regression references are retained
in [post-review-retained.md](post-review-retained.md). F05 is extended by
RV01/RV03; F11 and G01/G03 by RV04–RV06; F13 by RV08/RV09. G04–G06 recovery,
catalog and review behavior is extended by RV01–RV07. This register will record
new verification rather than treating earlier passes as current results.

## External acceptance

G07 live six-dish realism and live model/tool-choice evaluation require explicit
paid allowance as well as credentials. No paid allowance has been granted for
this pass. Physical scanner, device accessibility/login handoff, passkey/email,
installed PWA, live provider/worker and operator-volume Unraid acceptance require
the relevant isolated device/deployment and authorized test identities. They
remain unverified until directly exercised; deterministic checks do not replace
them. Missing historical migration archives must be supplied for the optional
archive gates; ordinary migration tests can still run.

## Original B-finding retention register

The source corrections and per-ID regression references remain in
[post-review-retained.md](post-review-retained.md). The current full-gate and
production-browser receipt is [rv-verification.md](rv-verification.md); it
re-executes the relevant existing suites rather than relabelling baseline images.
Physical camera/device and other external limits remain separate.

| Original ID | Current status                                         | Evidence                                                                             |
| ----------- | ------------------------------------------------------ | ------------------------------------------------------------------------------------ |
| B1-N03      | implemented but unverified in final consolidated rerun | Retained source/regression reference in prior per-ID register; current gates pending |
| B2-RD06     | implemented but unverified in final consolidated rerun | Retained source/regression reference in prior per-ID register; current gates pending |
| B2-ED08     | implemented but unverified in final consolidated rerun | Retained source/regression reference in prior per-ID register; current gates pending |
| B2-ED10     | implemented but unverified in final consolidated rerun | Retained source/regression reference in prior per-ID register; current gates pending |
| B2-ED11     | implemented but unverified in final consolidated rerun | Retained source/regression reference in prior per-ID register; current gates pending |
| B2-CK04     | implemented but unverified in final consolidated rerun | Retained source/regression reference in prior per-ID register; current gates pending |
| B2-CK05     | implemented but unverified in final consolidated rerun | Retained source/regression reference in prior per-ID register; current gates pending |
| B3-PN03     | implemented but unverified in final consolidated rerun | Retained source/regression reference in prior per-ID register; current gates pending |
| B3-PN05     | implemented but unverified in final consolidated rerun | Retained source/regression reference in prior per-ID register; current gates pending |
| B3-PN07     | implemented but unverified in final consolidated rerun | Retained source/regression reference in prior per-ID register; current gates pending |
| B3-SO08     | implemented but unverified in final consolidated rerun | Retained source/regression reference in prior per-ID register; current gates pending |
| B3-SO10     | implemented but unverified in final consolidated rerun | Retained source/regression reference in prior per-ID register; current gates pending |
| B3-SD04     | implemented but unverified in final consolidated rerun | Retained source/regression reference in prior per-ID register; current gates pending |
| B3-SD10     | implemented but unverified in final consolidated rerun | Retained source/regression reference in prior per-ID register; current gates pending |
| B4-ME06     | implemented but unverified in final consolidated rerun | Retained source/regression reference in prior per-ID register; current gates pending |
| B4-AS03     | implemented but unverified in final consolidated rerun | Retained source/regression reference in prior per-ID register; current gates pending |
| B5-NV02     | implemented but unverified in final consolidated rerun | Retained source/regression reference in prior per-ID register; current gates pending |
| B5-NG03     | implemented but unverified in final consolidated rerun | Retained source/regression reference in prior per-ID register; current gates pending |
| B5-CW03     | implemented but unverified in final consolidated rerun | Retained source/regression reference in prior per-ID register; current gates pending |
| B5-CW07     | implemented but unverified in final consolidated rerun | Retained source/regression reference in prior per-ID register; current gates pending |
| B5-PR02     | implemented but unverified in final consolidated rerun | Retained source/regression reference in prior per-ID register; current gates pending |
| B6-G04      | implemented but unverified in final consolidated rerun | Retained source/regression reference in prior per-ID register; current gates pending |
| B6-YP04     | implemented but unverified in final consolidated rerun | Retained source/regression reference in prior per-ID register; current gates pending |
| B6-NP04     | implemented but unverified in final consolidated rerun | Retained source/regression reference in prior per-ID register; current gates pending |
| B6-NP05     | implemented but unverified in final consolidated rerun | Retained source/regression reference in prior per-ID register; current gates pending |
| B6-AI02     | implemented but unverified in final consolidated rerun | Retained source/regression reference in prior per-ID register; current gates pending |
| B6-AI04     | implemented but unverified in final consolidated rerun | Retained source/regression reference in prior per-ID register; current gates pending |
| B6-ST03     | implemented but unverified in final consolidated rerun | Retained source/regression reference in prior per-ID register; current gates pending |
| B6-AS01     | implemented but unverified in final consolidated rerun | Retained source/regression reference in prior per-ID register; current gates pending |
| B6-HP02     | implemented but unverified in final consolidated rerun | Retained source/regression reference in prior per-ID register; current gates pending |
| B6-HP05     | implemented but unverified in final consolidated rerun | Retained source/regression reference in prior per-ID register; current gates pending |
| B6-LI01     | implemented but unverified in final consolidated rerun | Retained source/regression reference in prior per-ID register; current gates pending |
| B7-PL02     | implemented but unverified in final consolidated rerun | Retained source/regression reference in prior per-ID register; current gates pending |

## F/G reconciliation

| ID  | Current implementation/evidence                                                                                                                                  | Remaining acceptance                                                                              |
| --- | ---------------------------------------------------------------------------------------------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------- |
| F05 | Shared reviewed purchase quantity+unit, demand separation, explicit cart intent, actual saved cart and Pantry intake; `rv-catalog.md`                            | Physical scan/device flow remains separately unverified                                           |
| F11 | Approved direct/Batch/scheduled/image-retry settings and current model/reasoning/policy/cap checks at actual transmission boundaries; `rv-ai.md`, `rv-images.md` | No live provider cost/quality claim                                                               |
| F13 | One private revision-bound candidate lifecycle, known failure versus uncertainty, discarded late-output guard, explicit acceptance; `rv-images.md`               | Paid human image evaluation remains blocked                                                       |
| G01 | Ownership matrix retained; current policy constrains delayed execution and is not replaced by stale defaults                                                     | Operator configuration/deployment readiness not inferred from fixtures                            |
| G03 | Current sharing baseline and prompt/model/options provenance preserved through delayed/nested execution; previously transmitted evidence cannot be retracted     | Live model/tool-choice assessment requires paid allowance                                         |
| G04 | Durable scanner receipts/closures and original actor scope; retained chat lease/recovery checks rerun                                                            | Installed native process-kill/SecureStore behavior requires device/emulator                       |
| G05 | Local/outage scan, raw provider fixtures, exact revision, purchase units and intake/replay checks; capability matrix updated                                     | Live packs/provider/worker and physical scanner not activated                                     |
| G06 | Shared authoritative web/native reviews with target/context/change identity; stale guards and retained interview/tool workflows                                  | Native visual/accessibility handoff requires device; live model interview quality not inferred    |
| G07 | Existing six-dish deterministic fixtures, rubric and bounded opt-in evaluation path retained                                                                     | blocked: no explicit paid allowance; no null-score dry run relabelled as quality                  |
| G08 | Current audits and compatible patch, scoped source-map reachability, API/contracts/native builds and browser gates                                               | blocked: remaining upstream/native advisories plus stated device/PWA/email/operator-volume checks |

No new release, image publication or production deployment is implied by these
source changes. The prior rc.19 multi-architecture publication remains intact.
See the [verification receipt](rv-verification.md) for exact prerequisites and
commands for every externally gated item.
