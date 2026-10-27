# Scanner stations (contract v2)

Implementation source is branch `scanner/companion-v2`, based on `1e8950c` (rc.21).
The next migration is `0082_scanner_stations`; the existing AI privacy migration remains 0081.
The bridge checkout is `/srv/devbox-work/workspaces/callum/bord-scanner-companion`.
Production deployment and handheld display changes are separate from this development work.

## Ownership and delivery

A signed-in admin registers a station with one dedicated integration key. The station is bound
permanently to household instance, account, linked profile and key ID. Its shared screen belongs
to that signed-in account/profile. Changing a household profile is not impersonation permission.
An API key may read its own handshake, lookups and receipts and sync telemetry; registration,
station history and remote controls require the owning signed-in session. Command effects also
check their resource scopes and the live effective account/profile role.

Recommended key scopes are Pantry read/create/update and Recipes read/create/update. Planned
cards also need Meal Plans read; shopping demand needs Grocery Lists create, intake needs update.
Registration explicitly offers 600 requests/minute for the dedicated scanner key, since both the
proxy and route validate requests and telemetry shares that quota. Existing keys are left at
their prior quota unless that option is chosen. Rate limits retain the exact queued intent.

The bridge stores scans before delivery. A retail scan captures mode and package count. It then
resolves one verified local product, exact saved package amount/unit, one addition location and a
defaults fingerprint. That preparation is frozen once. A delayed unprepared scan (over 30 seconds)
requires review instead of silently adopting later defaults. A prepared intent never changes
its UUID, actor, station or command while retrying. Batch actions similarly freeze a version.

Bòrd commits effects and permanent receipts in one SQLite transaction. A matching repeat returns
the original result, even after later product edits. A terminal rejection also has a receipt.
Missing/ambiguous products, stale revisions and insufficient stock require visible review.
Redirects, wrong bindings, authorization failures and uncertain responses retain the queue.
The successful read beep does not acknowledge a household transaction.

A correction has a new UUID plus `supersedesOperationId`. Only terminally rejected operations or
explicitly unsubmitted captures qualify. Only one successful correction may supersede a scan.
Browser attempts are saved before POST; retrying after a lost response/reload preserves that
attempt. Stocktake drafts save the original batch versions and location in browser storage.
Local bridge review counts reconcile against successful corrections on subsequent syncs.

## Household workflows

- ADD/REMOVE use saved exact package amounts and compatible stock units. Count packages such as
  twelve eggs remain twelve, not one. Removals use existing FEFO stock allocation; arbitrary
  location-filtered product removal is rejected rather than guessed.
- Recipe QR cards immediately create and complete an owned cook, deduct mapped required
  ingredients and store the receipt atomically. There is no confirmation step. Cards pin revision
  and yield. Planned cards also pin the occurrence; stale, adapted, skipped or already-made meals
  require review. Optional ingredients are omitted by this automatic workflow.
- Undo names one prior eligible station operation. Batch revisions, subsequent consumption,
  linked leftovers or prepared intake prevent unsafe reversal. Stocktake undo is atomic across
  its affected batches. Shopping and leftovers use their existing correction workflows instead
  of a misleading generic scanner undo button.
- Unknown products use product-only catalog review: importing a product adds no stock. Save its
  verified barcode and package/location defaults, then submit an explicit correction.
- One-shot OPEN/FREEZE/THAW/MOVE/EMPTY/DISCARD/DONATE require a batch label. MOVE also needs a
  destination. The signed-in review screen supports exact versioned batch actions and reasons.
- Stocktake accumulates a local count draft for one location. Applying it changes only observed
  batches and rejects the whole draft if any baseline changed. Unobserved stock stays unchanged.
- Replenishment creates shopping demand without stock. Purchase intake names the shopping item,
  its updated timestamp, exact product/amount/unit/location and a stable intake key. Replays do
  not add another batch or purchase receipt.
- Leftovers link to an owned completed cook and record prepared portions as new stock. Raw
  ingredients are not deducted again. Personal eating and nutrition are a separate signed-in
  workflow; v1 integration keys do not gain access to personal diary commands.

## Feedback and printing

`/scanner` shows active mode, next package count/location, expiry, reader connectivity, queue,
review failures and saved receipts. Remote controls are short-lived and require the current
bridge boot UUID and state revision. The screen reports stale status after 15 seconds. A
restart always resets mode; retained events from earlier boots remain valid outbox records.
Sync frames are bounded by count and bytes and acknowledge exact sequences. Permanent receipts
outlive telemetry; telemetry is retained for 30 days and station responses show bounded history.

`/scanner/cards` downloads local PDFs for controls, locations, individual batches and recipes.
Existing recipe PDF exports include eligible immediate-cooking QR codes. Planner schedule PDFs
include eligible, current, non-adapted recipe occurrence codes. Reprint after recipe changes.
No recipe URL is fetched or executed by the bridge. Printable codes are application data, not
scanner firmware settings. The handheld display and product dictionary remain untouched.

## Development and rollout

The synthetic fixture is `.test-data/scanner-demo/bord.db`; bridge config/access are private
under its `var/`. `scripts/seed-scanner-demo.ts` refuses to overwrite either existing state.
Never seed or reset a production household. Browser verification is a one-shot test against only
that synthetic named development origin: `node scripts/verify-scanner-browser.mjs`.

Before production, back up Bòrd and the queue, reconcile pending/legacy operations, port this
branch alongside the current application work, verify migration numbering again, and run the
application checks. A historical rc.20 scanner database is a different migration lineage; never
point this build at it or apply the old patch blindly. Start with an empty, separately bound
queue for a new target. Test unplug/replug, scanner Enter/US layout, offline/restart and actual
printed cards on the intended host. Neither this work nor a Devbox input ACL proves Docker or
Unraid device hotplug behavior. Production Bòrd has not been changed.

## Current verification snapshot

Final bridge checks: 23 passing tests plus Ruff lint/format. Bòrd: 707 unit checks and
509 integration checks pass (9 existing skips); TypeScript, ESLint, Prettier, OpenAPI
coverage/client smoke and release artifact validation pass. The synthetic browser oracle
passed on the built standalone preview, including a lost post-commit reply and reload retry,
acknowledged receiver mode, saved/reloaded stocktake draft, mobile layout and deployed USDA
barcode lookup. The optional product pack is skipped when disabled. A decoded generated PDF
contains the expected immediate recipe command. Full evidence and device/production limits
are recorded in the bridge's VERIFICATION.md. No production or handheld display change was made.

## Latest headless add-only policy

The user explicitly approved first-time automatic creation from one exact catalog match as one
counted package. The helper defaults to persistent ADD, with removal/recipe/undo commands disabled
unless `SCANNER_PROFILE=extended` is configured. No browser interaction or ADD card is needed in
normal operation. A destination is configured once; the handshake also offers a default only
when exactly one pantry-type location exists. The synthetic station is configured for Kitchen
pantry because its Bread bin is also pantry-type.

`pantry_catalog_add` carries the exact source identity/revision, GTIN, package count and location.
Bòrd reads the source before opening SQLite's stock transaction, then commits product/snapshot,
counted batch and permanent scanner receipt together. A committed replay never calls the catalog.
Weight, volume and expiry remain unknown; no density or per-package nutrient amount is invented.
Known products retain saved package units. Identifier matching checks the verified canonical
value before normalizing a display value, preserving UPCs with leading zeros after import.
Ambiguous/no matches and conflicting product/unit data still require follow-up. Transient catalog
outages retain unprepared add-only captures, which can resolve after reconnection; prepared
commands always retain their frozen values. Personal intake and display behavior are unchanged.

The helper's multi-stage Dockerfile and USB Compose deployment have no inbound ports or frontend.
Devbox's managed Docker interface does not support device mappings, and three image builds failed
on host DNS resolving Docker Hub/CDN endpoints. The current physical development runtime therefore
uses the native helper; no working USB container or successful image build is claimed.

Headless acceptance passed against the deployed food API and synthetic Bòrd preview: first scan
created GREAT VALUE, LEMONADE, second scan added a second package, replay added nothing and a known
product added its exact 500 g package. No browser was used. The main CLI also accepted a bare
retail code and saved stock without an ADD card. Current bridge checks: 27 passed; Bòrd full suite
707 unit / 510 integration checks (9 skips), with 45 affected checks rerun after the canonical
identifier regression fix. The release build, TypeScript, lint/format and artifact checks pass.
