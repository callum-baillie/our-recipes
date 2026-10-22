# RV scan confirmation and recovery

## Scope and starting evidence

This correction pass starts at `45ed512b2d4909dac78ceb096d985dab85387d24` in the
isolated `refinement/rv-completion` worktree. The primary checkout's concurrent
My Kitchen work is untouched. Results below apply to the working-tree changes;
the consolidated release receipt records the final tested revision.

| Finding    | Starting behavior rechecked                                                                                                                                                                                                        | Change and status                                                                                                                                                                                                                                                 |
| ---------- | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| RV01 / F05 | Web Scan used its own cart mutation: old cart amount plus scanned amount, paired with the demand unit. It could mark completion during the scan.                                                                                   | **Behavior verified with focused tests.** Web and native use the shared reviewed confirmation builder. Explicit replacement sets the reviewed purchase amount/unit; separate entry leaves existing rows intact. No implicit purchase completion or Pantry intake. |
| RV02 / G04 | Local Pantry used the generic 24-hour receipt cleanup. Restart recovery offered exact retry even when an older receipt could already have been deleted. Stale source/list failures could leave the original native journal locked. | **Server and journal behavior verified; physical native workflow unverified.** Durable receipts, authorized inspection and explicit unknown closure cover all three scanner paths. Native preserves immutable original commands and encrypted closed history.     |
| RV03 / G05 | The web scanner ignored a valid `localProduct` when the provider returned no source record.                                                                                                                                        | **Behavior verified with component and persisted-service tests.** Saved local barcode matches are reviewed and confirmed by structured product ID without importing or contacting the provider.                                                                   |

## User-facing behavior

`ShoppingScanReview` replaces the independent scan implementation inside the
existing shopping dialog. It reuses the existing scanner, catalog context,
quantity formatter and dialog styles. The review shows the saved local product
or attributed exact source revision, amount/unit, and the chosen cart destination.
Supported source portions keep their full stated amount/unit; choosing an explicit
source gram weight does not infer a density or equate count with mass.

A replacement says what will change, including the old cart quantity and the
unchanged recipe demand. Adding a separate entry is explicit. Successful feedback
says that the cart amount was saved and that no purchase completion or Pantry
intake was recorded. A failed read-after-write preserves the acknowledgement and
offers refresh without another write. An uncertain in-memory web request retains
the same operation and frozen payload for exact retry. The account and viewing
profile are read before the first mutation and retained with the command; the
expected-profile header guards the write. A failed context read is not attempted
and leaves the draft editable. Retry and recovery require the current actor to
match the original account/profile. This pass does not claim browser-restart
persistence for the web scan dialog.

The final mounted-component review found a web recovery trap after an uncertain
request followed by a permanent 404/409. The dialog now supports inspection of the
original receipt, review of the saved list in another tab, and explicit closure
of an unknown confirmation. Missing receipts and failed recovery do not unlock it.
An acknowledgement that wins before closure is treated as saved; an abandoned
operation remains visibly unknown in the page's retained closed history. Closure
does not undo earlier changes. That history remains in memory for the page lifetime.

The persisted regression begins with **500 g in the cart and 2 each demand**.
Confirming **1 g** replaces the cart amount with 1 g, keeps demand at 2 each, and
leaves the row `in_cart` and unchecked. Coverage cannot be inferred across those
dimensions. A separate 500 g confirmation leaves the 1 g row intact; explicit
purchase intake creates one 500 g batch, including exact replay. It never yields
501 each or falsely completes the demand.

## Recovery contract

`POST /api/v1/food-data/confirmations/recovery` accepts:

```json
{
  "operationId": "original UUID",
  "action": "inspect",
  "actor": { "userId": "original account", "profileId": "original profile UUID" },
  "commandPath": "/api/v1/pantry/batches",
  "command": {
    "productId": "original UUID",
    "locationId": "original UUID",
    "quantityRemaining": 500,
    "unit": "g"
  }
}
```

The example uses placeholders for identifiers. `command` must be the original
submitted JSON, not a reconstruction from current product/list defaults. Only
`/pantry/batches`, `/pantry/catalog-imports`, and
`/shopping-lists/{UUID}/catalog-items` under `/api/v1` are accepted. The handler
validates the exact destination schema, current authentication, original account
and viewing profile, trusted session origin, and the original operation's current
permissions. Shopping recovery cannot be used with only a Pantry-scoped API key.
OpenAPI and the integration route allowlist describe this single recovery endpoint.

- **Acknowledged:** returns a retained generic or domain receipt before contacting
  the catalog or checking whether the current product/list still exists. It does
  not create a second write. Changed intent remains a conflict.
- **Not recorded, outcome unknown:** no retained receipt establishes whether an
  older request committed. The app directs the user to review the saved destination.
- **Abandoned, outcome unknown:** explicit review closes future execution of the
  original operation. A durable server tombstone is written under the SQLite write
  lock. The app retains the original encrypted command before clearing the active
  journal. This is not a rollback or proof that no earlier write occurred.

New receipts and tombstones for the three scanner paths survive the generic
24-hour cleanup, including older already-expired receipts still present in the
database. Already-deleted historical receipts cannot be reconstructed: local
Pantry restart recovery therefore inspects first instead of blindly retrying.
Catalog and shopping confirmations retain their existing durable domain receipt
and exact-retry behavior, with inspection/closure available for unavailable or
stale targets. Both catalog commit paths recheck closure after provider work;
shared service entry points also honor session closure. A delayed provider response
cannot write after closure wins the transaction lock.

Native recovery remains bound to its original instance/account/profile. A switch
during a request cannot use the new journal or display the old result as a newly
targeted save. Duplicate activation is locked. Storage failure, denied authority
or failed recovery keeps the active original command. Closed history is bounded
to 50 entries and remains encrypted; reaching that bound retains the active record
and reports the storage limitation rather than silently deleting evidence.

## Focused verification

All provider responses in these checks are bounded synthetic fixtures. No real
credentials, household records, provider acquisition or paid calls were used.

| Command                                                                                                                                                                                           | Executed result / coverage                                                                                                                                                                                                                                                                                                             |
| ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | -------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `PATH=/tmp/bord-refinement-bin:$PATH pnpm exec vitest run --project unit tests/unit/rv-shopping-scan.test.ts tests/unit/catalog-post-review.test.ts tests/unit/pantry-shopping-workflows.test.ts` | **29 passed.** Actual `ShoppingListEditor` consumer plus direct scan review; local-only outage, explicit replacement/separate amount, full source portion, immutable retry, shared journal/archive rules.                                                                                                                              |
| `PATH=/tmp/bord-refinement-bin:$PATH pnpm exec vitest run --project integration tests/integration/rv-pantry-recovery.test.ts`                                                                     | **12 passed.** Expired historical receipt retention, exact replay, changed intent, account/profile/origin/permission/revocation, unknown/closure, historical missing receipt, raw provider 404 and expired revision, deleted shopping target, acknowledged replay during outage, and both in-flight catalog write paths after closure. |
| `PATH=/tmp/bord-refinement-bin:$PATH pnpm exec vitest run --project integration tests/integration/bord-catalog.test.ts -t 'RV scan'`                                                              | **1 passed; 17 unrelated cases not selected.** Real adapter's raw barcode fixture with local fallback during outage, persisted 500 g/2 each/1 g semantics, separate entry and one-batch purchase intake replay.                                                                                                                        |
| `cd mobile && npx --yes npm@11.4.2 exec -- vitest run tests/catalog-post-review.test.ts`                                                                                                          | **15 passed.** Shared native identity/portion/generation and encrypted journal contracts, including unknown archive persistence and storage failure. These are deterministic tests, not a device run.                                                                                                                                  |

Final web follow-up: `pnpm exec vitest run --project unit tests/unit/rv-shopping-scan.test.ts`
passed **10/10** on Vitest 4.1.11, including the original three cases plus failed
auth-context lookup, uncertain 404 and 409, acknowledgement winning during closure,
account and profile changes, and preserved actor binding after a known initial
rejection. Scoped ESLint passed for the component and mounted tests. The earlier
29-test combined receipt predates these seven added cases. The consolidated gate
records the final results with the subsequently updated dependencies.

The first generalized test run exposed two fixture assertions, corrected before
the passing run: a missing pinned provider revision intentionally maps raw 404 to
application `REVISION_EXPIRED` 409; direct service test inputs must use the same
schema-normalized defaults as HTTP. Per-test fixture reset prevents a failed outage
assertion from contaminating later tests. No application rule was weakened to make
those fixtures pass.

`tests/e2e/rv-shopping-scan.spec.ts` is included in the consolidated browser runner.
It uses a synthetic household, intercepts only the barcode outage response and
uses the actual confirmation/list routes for writes. It checks 1440×1000,
390×844 and 320×844, overflow, dialog accessibility and stored quantities; its
`source.json` records revision, working-tree state and capture time. Fresh browser
execution and captures are reported in the root RV receipt, not inferred from the
existence of this specification. Baseline screenshots are not reused as after evidence.

Native camera permission, scanner hardware, SecureStore restart on installed
iOS/Android, TalkBack/VoiceOver and physical keyboard/safe-area behavior remain
unverified without the corresponding device/emulator. Type/lint/bundle receipts
are recorded by the consolidated native gate and do not replace those checks.
