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

| ID   | Owner          | Affected surfaces and acceptance                                                                                | Status   | Implementation / evidence                                                  |
| ---- | -------------- | --------------------------------------------------------------------------------------------------------------- | -------- | -------------------------------------------------------------------------- |
| RV01 | Catalog/native | Web scan uses reviewed confirmation; purchase dimension stays separate from demand; persisted cart/intake check | verified | [rv-catalog.md](rv-catalog.md); scoped automated evidence and limits below |
| RV02 | Catalog/native | Durable local Pantry receipts, actor/intent checks, restart/expiry replay and explicit unknown-outcome recovery | verified | [rv-catalog.md](rv-catalog.md); scoped automated evidence and limits below |
| RV03 | Catalog/native | Local barcode product succeeds without remote alternatives, including provider outage                           | verified | [rv-catalog.md](rv-catalog.md); scoped automated evidence and limits below |
| RV04 | AI execution   | Current sharing checked before every request; later serialized rounds cannot resend revoked cached context      | verified | [rv-ai.md](rv-ai.md); scoped automated evidence and limits below           |
| RV05 | AI execution   | Scheduled execution preserves approved model/prompt/options; current revocations stop execution                 | verified | [rv-ai.md](rv-ai.md); scoped automated evidence and limits below           |
| RV06 | AI execution   | Same-model revoked reasoning blocked in direct and Batch paths                                                  | verified | [rv-ai.md](rv-ai.md); scoped automated evidence and limits below           |
| RV07 | Reviews        | Shared authoritative target/context/before-after review; stale named-meal deletion denied                       | verified | [rv-reviews.md](rv-reviews.md); scoped automated evidence and limits below |
| RV08 | Root           | Candidate/job/item/audit terminal states agree; uncertainty and discard remain distinct                         | verified | [rv-images.md](rv-images.md); scoped automated evidence and limits below   |
| RV09 | Reviews        | Image action says prepare preview and explains separate acceptance                                              | verified | [rv-reviews.md](rv-reviews.md); scoped automated evidence and limits below |

## Retained scope

The 33 original B findings and their existing regression references are retained
in [post-review-retained.md](post-review-retained.md). F05 is extended by
RV01/RV03; F11 and G01/G03 by RV04–RV06; F13 by RV08/RV09. G04–G06 recovery,
catalog and review behavior is extended by RV01–RV07. This register records
new verification rather than treating earlier passes as current results.

Here, **verified** refers to the named deterministic component, handler/database,
SDK-request or browser checks. It does not claim the externally gated device,
live-provider, paid-quality or deployment acceptance below. All nine RV source
corrections are implemented; the overall refinement remains incomplete while
those required external checks and dependency findings remain open.

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

| Original ID | Current status                      | Evidence                                                                                                |
| ----------- | ----------------------------------- | ------------------------------------------------------------------------------------------------------- |
| B1-N03      | verified (retained automated scope) | Retained per-ID source/test references + current consolidated gates; original external limits unchanged |
| B2-RD06     | verified (retained automated scope) | Retained per-ID source/test references + current consolidated gates; original external limits unchanged |
| B2-ED08     | verified (retained automated scope) | Retained per-ID source/test references + current consolidated gates; original external limits unchanged |
| B2-ED10     | verified (retained automated scope) | Retained per-ID source/test references + current consolidated gates; original external limits unchanged |
| B2-ED11     | verified (retained automated scope) | Retained per-ID source/test references + current consolidated gates; original external limits unchanged |
| B2-CK04     | verified (retained automated scope) | Retained per-ID source/test references + current consolidated gates; original external limits unchanged |
| B2-CK05     | verified (retained automated scope) | Retained per-ID source/test references + current consolidated gates; original external limits unchanged |
| B3-PN03     | verified (retained automated scope) | Retained per-ID source/test references + current consolidated gates; original external limits unchanged |
| B3-PN05     | verified (retained automated scope) | Retained per-ID source/test references + current consolidated gates; original external limits unchanged |
| B3-PN07     | verified (retained automated scope) | Retained per-ID source/test references + current consolidated gates; original external limits unchanged |
| B3-SO08     | verified (retained automated scope) | Retained per-ID source/test references + current consolidated gates; original external limits unchanged |
| B3-SO10     | verified (retained automated scope) | Retained per-ID source/test references + current consolidated gates; original external limits unchanged |
| B3-SD04     | verified (retained automated scope) | Retained per-ID source/test references + current consolidated gates; original external limits unchanged |
| B3-SD10     | verified (retained automated scope) | Retained per-ID source/test references + current consolidated gates; original external limits unchanged |
| B4-ME06     | verified (retained automated scope) | Retained per-ID source/test references + current consolidated gates; original external limits unchanged |
| B4-AS03     | verified (retained automated scope) | Retained per-ID source/test references + current consolidated gates; original external limits unchanged |
| B5-NV02     | verified (retained automated scope) | Retained per-ID source/test references + current consolidated gates; original external limits unchanged |
| B5-NG03     | verified (retained automated scope) | Retained per-ID source/test references + current consolidated gates; original external limits unchanged |
| B5-CW03     | verified (retained automated scope) | Retained per-ID source/test references + current consolidated gates; original external limits unchanged |
| B5-CW07     | verified (retained automated scope) | Retained per-ID source/test references + current consolidated gates; original external limits unchanged |
| B5-PR02     | verified (retained automated scope) | Retained per-ID source/test references + current consolidated gates; original external limits unchanged |
| B6-G04      | verified (retained automated scope) | Retained per-ID source/test references + current consolidated gates; original external limits unchanged |
| B6-YP04     | verified (retained automated scope) | Retained per-ID source/test references + current consolidated gates; original external limits unchanged |
| B6-NP04     | verified (retained automated scope) | Retained per-ID source/test references + current consolidated gates; original external limits unchanged |
| B6-NP05     | verified (retained automated scope) | Retained per-ID source/test references + current consolidated gates; original external limits unchanged |
| B6-AI02     | verified (retained automated scope) | Retained per-ID source/test references + current consolidated gates; original external limits unchanged |
| B6-AI04     | verified (retained automated scope) | Retained per-ID source/test references + current consolidated gates; original external limits unchanged |
| B6-ST03     | verified (retained automated scope) | Retained per-ID source/test references + current consolidated gates; original external limits unchanged |
| B6-AS01     | verified (retained automated scope) | Retained per-ID source/test references + current consolidated gates; original external limits unchanged |
| B6-HP02     | verified (retained automated scope) | Retained per-ID source/test references + current consolidated gates; original external limits unchanged |
| B6-HP05     | verified (retained automated scope) | Retained per-ID source/test references + current consolidated gates; original external limits unchanged |
| B6-LI01     | verified (retained automated scope) | Retained per-ID source/test references + current consolidated gates; original external limits unchanged |
| B7-PL02     | verified (retained automated scope) | Retained per-ID source/test references + current consolidated gates; original external limits unchanged |

## F/G reconciliation

| ID  | Status                         | Current implementation/evidence                                                                                                                                  | Remaining acceptance                                                                              |
| --- | ------------------------------ | ---------------------------------------------------------------------------------------------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------- |
| F05 | verified                       | Shared reviewed purchase quantity+unit, demand separation, explicit cart intent, actual saved cart and Pantry intake; `rv-catalog.md`                            | Physical scan/device flow remains separately unverified                                           |
| F11 | verified                       | Approved direct/Batch/scheduled/image-retry settings and current model/reasoning/policy/cap checks at actual transmission boundaries; `rv-ai.md`, `rv-images.md` | No live provider cost/quality claim                                                               |
| F13 | verified                       | One private revision-bound candidate lifecycle, known failure versus uncertainty, discarded late-output guard, explicit acceptance; `rv-images.md`               | Paid human image evaluation remains blocked                                                       |
| G01 | verified                       | Ownership matrix retained; current policy constrains delayed execution and is not replaced by stale defaults                                                     | Operator configuration/deployment readiness not inferred from fixtures                            |
| G03 | verified                       | Current sharing baseline and prompt/model/options provenance preserved through delayed/nested execution; previously transmitted evidence cannot be retracted     | Live model/tool-choice assessment requires paid allowance                                         |
| G04 | implemented but unverified     | Durable scanner receipts/closures and original actor scope; retained chat lease/recovery checks rerun                                                            | Installed native process-kill/SecureStore behavior requires device/emulator                       |
| G05 | implemented but unverified     | Local/outage scan, raw provider fixtures, exact revision, purchase units and intake/replay checks; capability matrix updated                                     | Live packs/provider/worker and physical scanner not activated                                     |
| G06 | implemented but unverified     | Shared authoritative web/native reviews with target/context/change identity; stale guards and retained interview/tool workflows                                  | Native visual/accessibility handoff requires device; live model interview quality not inferred    |
| G07 | blocked: paid allowance absent | Existing six-dish deterministic fixtures, rubric and bounded opt-in evaluation path retained                                                                     | blocked: no explicit paid allowance; no null-score dry run relabelled as quality                  |
| G08 | implemented but unverified     | Current audits and compatible patch, scoped source-map reachability, API/contracts/native builds and browser gates                                               | blocked: remaining upstream/native advisories plus stated device/PWA/email/operator-volume checks |

No new release, image publication or production deployment is implied by these
source changes. The prior rc.19 multi-architecture publication remains intact.
See the [verification receipt](rv-verification.md) for exact prerequisites and
commands for every externally gated item.

## Additional concrete corrections found during closure

- **Shopping review shape:** actual stored rows use `item`, not a fixture-only
  `name`. The real handler regression now deletes only the named target and
  shows 333 g to buy separately from 2 can in cart. Seven helper and four service
  cases passed; the original-shape regression failed before correction.
- **Account-switch interval:** an account can legitimately view the same profile
  as another account. Confirmation now binds both captured user and profile
  before receipt/provider/write. A real second login/profile-switch regression
  verifies all three routes reject the wrong account with no effects.
- **Focused review after resize:** the first fresh 320px/200% test reproduced
  auto-follow scrolling a focused Confirm action out of view. Focus now owns
  reading position; resize/content changes reveal that control with scroll
  padding. The stronger full-viewport assertion and component regression pass.
- **Shared modal initial placement:** final-source CI exposed a queued initial
  focus callback resetting a completed keyboard wrap. The new unit case fails
  before correction; the source fix and all standard mobile viewport checks now
  pass. Its CI before capture is retained separately.
- **October 22 dependency findings:** supported Next 16.4.1 and Vitest 4.1.12 updates
  address newly reported advisories; the dependency report retains unresolved
  braces and native chains rather than repeating historical clean claims.

## Publication

Implementation is committed and pushed on `refinement/rv-completion`:
`a0a0f2c`, `fd6d35e` and `f2ff37c`. Final captures target `f2ff37c`; narrative/API
documentation and evidence are published separately. The tested source hash is
in `rv-evidence/tested-source.json`. No merge, new release tag, container
publication or deployment was performed. Preserve the migration integration
warning in the verification receipt before any later deployment.

Final automated gates are green on `f2ff37c`:702 root unit, 440 integration
(9 unavailable archives skipped),19 release browser +3 performance,24
post-review browser,75 native cases, API/client/build/format/lint/types and
both native exports. The additional isolated amd64 Docker smoke passed with
synthetic data; operator-volume/Unraid and current arm64 runtime acceptance
remain distinct from that result. See the verification receipt and CI link.
