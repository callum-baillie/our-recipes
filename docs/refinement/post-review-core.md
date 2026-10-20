# Post-review core work

Base: clean `160441dd74ef79dab936a34a0f1c5e74065311c1`, branch `refinement/post-review-completion`. This is implementation evidence for the working diff, not a release or deployment receipt.

## F01 restoration boundary

The original trigger was reproduced by `tests/integration/restore-credential-barrier.test.ts`: a backup-era session, revoked after archive creation, became valid while the real restore handler awaited paused filesystem cleanup. The replacement now verifies integrity **and commits credential invalidation synchronously inside the durable restore barrier**. Only then may the marker be removed. The handler no longer invalidates after cleanup. Invalidation errors follow the existing whole-consistency-set rollback; incomplete rollback retains the barrier and recovery directories.

Focused acceptance uses the real Better Auth instance, SQLite, restore handler, protected API and proxy. While cleanup is paused, both the restored/revoked session and scoped API key remain denied. The invoking session is also revoked; fresh sign-in works. A controlled invalidation error after its transaction produces409 and restores the previous database/session state.

Independent review also found a stateless Better Auth email-verification JWT could create a fresh session after restore. A real-handler regression first reproduced the accepted old link. Verification now uses the library's signer/verifier plus a one-use, expiring issuance ledger in the existing verification table; restore clears it within the same barrier. A library-supported random claim distinguishes same-second replacement links. Old/untracked links require a fresh request, including links issued before this upgrade. The new `/verify-email` page provides that recovery without revealing account existence or claiming delivery. Real-handler tests reject the restored link and a reused new link, and accept a newly issued link after restore; only email transport is mocked.

In-flight library handlers/API calls and verification issuance share a process-global authentication fence. Restore closes admission before draining existing authentication for a bounded 30 seconds, then performs the synchronous guarded swap. Six fence tests cover draining, nesting, serialization, timeout and error release. The durable marker remains the fail-closed restart boundary; neither the fence nor these fixtures establishes coordination across independent app processes. Run one writer instance during recovery.

`restore-interruption.test.ts` terminates separate real Node processes immediately before and after invalidation inside the swap verification callback. Both leave the durable marker; runtime database access and container startup migration refuse access after restart, and health returns503. This crash fixture exercises the swap/database boundary, not an HTTP process kill during archive validation. Existing mounted-root, rollback/sidecar and cross-bundle reopening fixtures remain required. No production data or operator volume was restored.

## G08 SQLite authentication transactions

The localhost Chromium virtual-authenticator flow exposed a real registration failure: Better Auth 1.6.25 passed an asynchronous verification-consumption transaction to Drizzle's synchronous `better-sqlite3` driver, producing `Transaction function cannot return a promise` and HTTP 500. A focused real-handler regression also reproduced the same failure for password reset; both concurrent reset attempts returned 500.

The auth Drizzle adapter now uses its supported default `transaction: false` mode. This does not make a library request a multi-statement SQLite transaction. Single-use verification claims remain an atomic SQLite `DELETE ... RETURNING`, backed by the library's identifier consume lock and stale-row cleanup. Public sign-up and social enrollment are disabled/unconfigured; household enrollment and restore invalidation retain their own synchronous application transactions. No trusted-origin setting changes.

`tests/integration/auth-sqlite-verification.test.ts` exercises the real auth handler and SQLite with only email delivery mocked. Concurrent attempts to use an authentication challenge for registration must reject the wrong ceremony without issuing a credential/session, and consume the challenge. Concurrent password resets must yield exactly one success, reject replay and the old passphrase, revoke previous sessions and permit sign-in with the replacement passphrase. Complete passkey enrollment/sign-in/removal, revoked-session rejection and email sign-in recovery passed the separate Chromium virtual-authenticator browser check; neither fixture establishes physical-authenticator compatibility.

## F05/F06 purchase amounts

Migration0073 adds nullable `shopping_list_items.cart_unit`. Demand (`quantity`,`unit`) remains separate from purchase (`cartQuantity`,`cartUnit`). Legacy null units are unreviewed: no parser guesses from labels or demand. Unpack starts blank for those amounts and the editor requests unit review. New manual purchases explicitly set their displayed unit. Compatible g/kg coverage converts through shared inventory rules; incompatible dimensions and unknown demand have no numeric remaining claim. True zero is preserved.

Catalog confirmation accepts a reviewed remote record or an existing local product ID. Existing-row intent replaces its reviewed cart amount; separate-entry intent bypasses generic demand-row deduplication. The state change and actor/intent-bound durable receipt commit in the same transaction. Completed replay precedes provider access. Existing-row timestamps advance monotonically at SQLite precision, so immediately competing confirmations cannot share the same accepted version. The returned receipt identifies the committed amount/unit and intent. Source snapshots remain linked to the product.

`bord-catalog.test.ts` asserts persisted500g against unchanged2each demand, actual synthetic Pantry intake500g, exact intake replay, separate-entry zero/kg persistence, stale-row rejection and confirmation replay during provider outage. `shopping-cart.test.ts` covers g/kg, mass/volume/count mismatch, zero, unknown and legacy unreviewed units. No density conversion or external retailer cart is introduced.

## F14/G04/G06/G01 interface work

- Circular chat styling is restricted to attach/send icon controls; Stop, recovery and jump actions use readable wrapping text buttons. Constrained footer detail scrolls, keyboard hints recede, and forced colors retain boundaries.
- Reopened chat recognizes server-owned unreviewed unknown turns. Explicit acknowledgment reviews saved outcomes without replaying or undoing effects; pending requests still block separate sends.
- Guided interview offers optional topic suggestions, topic access, skip/back/edit/resume and named summary. Saved answers remain separate. Three-way merging preserves current untouched answers, explicit overlapping choices precede a versioned scoped patch, and blank clearing is deliberate.
- System exposes sanitized effective food-data mode/fallback/deadline/quota/cache/stale settings. These are startup environment policy, not misleading editable controls. Existing source-pack readiness remains separate from configured capability; credentials are never serialized.

## Accessibility reference and remaining evidence

Implementation uses current [WCAG2.2](https://www.w3.org/TR/WCAG22/) guidance, including [focus not obscured](https://www.w3.org/WAI/WCAG22/Understanding/focus-not-obscured-minimum.html) and [target size minimum](https://www.w3.org/WAI/WCAG22/Understanding/target-size-minimum.html). The app's44px design goal exceeds the24px AA minimum with its exceptions; it is not a claim that every workflow passes WCAG. Browser evidence and final gates are recorded separately. Native dynamic text/screen readers/physical camera, physical passkeys/live email, installed PWA, production source packs, operator volumes and paid model/image quality remain external checks.
