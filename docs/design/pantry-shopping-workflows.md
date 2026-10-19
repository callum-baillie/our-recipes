# Pantry and shopping UI contracts

These workflows use the shared paper surfaces, green ink, terracotta task actions, `PageHeader`, native control sizing and disclosure rows. Pantry and shopping browsing use the wide shell; physical counting uses the standard shell. Mobile shopping detail keeps its focused Bòrd header and reserved trip dock.

## Pantry

- A stock card reserves a separate 44px management area. Every text wrapper can shrink; names wrap and clamp to three lines on cards, with full identity in management. Brand, variant, location and recorded date context remain intact.
- Summary actions name their entity: active batches, low-stock products and batches updated in the last seven days. Zero metrics stay quiet. Essentials counts products and qualifies uncertain stock subtotals; No grouping remains a valid saved preference.
- Date, lifecycle and amount are separate facts. No expiry recorded is not a quality assessment. Known stock requires an exact quantity; approximate and unknown amounts keep their meanings.
- Batch management uses `AppDialog`: identity, remaining amount/location, visible close, native top layer, focus return and a bounded scrolling body. Quick actions await reload before another versioned mutation. A batch removed from active stock exposes a contextual Undo using the returned version. If a batch leaves the view, focus moves to another stock control or search.
- Open package, Use 1 [unit], Use amount and Mark empty name their consequences. Physical correction remains separate. Adding another batch confirms its immediate stock effect and quantity; dates and price are reset as before.
- Management forms retain entered values after recoverable request failures. Batch forms refresh to the confirmed version after success; another edited form must be explicitly discarded before a different stock action can proceed. Location, product, restock-policy and activity disclosures remain reachable on phones and when filters return zero batches.
- Pantry filters apply live. Selecting an inactive lifecycle enables inactive/archived visibility; switching visibility off clears incompatible status/view restrictions. Clear filters preserves arrangement. Membership and arrangement controls are separate.

## Count your pantry

- A draft contains quantity, unit and the expected stock version. Dirty/readiness checks compare quantity and unit with the confirmed baseline; unknown, zero and fractions are distinct. Unit-only corrections can be saved, and returning to the baseline clears dirty state.
- Counts recover from bounded device storage before new edits can overwrite them. Navigation/reload protection supplements recovery. Storage failure leaves the editor usable with explicit feedback. Recovery never changes stock.
- Save all names the complete dirty scope, including changes outside the current search/location view. Invalid counts/units explain why saving is unavailable. Successful rows advance their baseline and expected version; failed rows retain their input.
- Recorded-stock review reads the current batch without mutating it. Keeping a count for review explicitly adopts that baseline/version; saving remains a separate action. Inactive batches require Pantry restoration. A Saved marker describes the current confirmed value and disappears on another edit.
- The footer stays in normal flow on phones and short viewports so it cannot cover counts or focused controls. Per-row save remains available.

## Shared catalog and review

- Both idle lookup modes expose Enter details manually. Opening it focuses the manual form and preserves the rapid queue. Scan several items queues packages for explicit review/addition; it does not infer expiry or add stock immediately.
- Read-only lookup can be cancelled; stale responses cannot fill a closed/new manual entry. Camera fallback switches to and focuses Search / barcode entry. Existing provider attribution, local results, operation IDs and partial retry remain intact.
- Review pantry names household scope, independent of visible filters. Paid permission applies to the review only; saved suggestions can be reused without a new request. Restock quantities remain locally calculated, and suggestions never silently change stock.

## Shopping overview

- Populated households get a compact New list disclosure; its draft survives collapse. List name and the automatic-restock destination choice precede creation. Open planner is navigation.
- Current lists excludes archives; Items remaining filters lists with open item rows; All items sourced excludes empty lists. Household totals use the same list sets and label open item rows separately.
- Card progress counts sourced rows. To find, in cart and explicit Pantry intake remain distinct. A generated AI snapshot has its generation time near its heading and retains its original output; current totals remain separate.
- More actions owns a trailing card area and uses viewport-aware nonmodal placement. Rename failures retain their input; duplication exposes an Open the copy destination even when filters hide it. Archive/restore, deletion safeguards, copied item states and Complete trip semantics are unchanged.
- Complete trip moves in-cart rows to sourced, archives the list and clears Next shop. Unresolved rows remain unresolved. Recently updated lists is a summary preview, not an event log.

## Shopping detail

- Search changes display rows only. Whole-list collections drive progress, trip review and unresolved navigation. A filtered/no-match view cannot imply that the trip is complete.
- Identity, optional badges and quantity have named layout areas. Unknown purchase amounts retain recipe demand plus a review cue. Buy quantity, cart quantity, package structure and Pantry stock remain separate; display formatting does not change stored demand.
- Shopping mode prioritises Add to cart and exception/recovery actions. Sourced rows use subdued recovery controls and retain alternative state transitions. Review trip opens review; its Finish shopping link only returns to Lists.
- Manage list exposes item editing, Sort and Group on phones. `AppDialog` provides a bounded labelled editor. Name, buy quantity, unit and aisle use one explicit Save/Cancel boundary; invalid/network-failed input stays local for correction. Cart zero remains valid; buy quantity follows its existing positive-or-unknown schema.
- Movement is available in List order, relative to visible neighbours in the same state/aisle. It updates local positions immediately, sends the complete ID list and rolls back on failure. Movement/removal are explicitly immediate; cancelling field edits does not undo a saved move.
- Shopping tools groups secondary actions without shrinking seven mobile controls into a fixed row. Aisle/state shortcuts reveal their targets. Native dialogs stay above the dock; the list reserves safe-area space for the final row.

## Shared primitives

`SearchFacetBar.advancedLabel` names its optional advanced action for the consumer. `ResultsToolbar.density="compact"` keeps short count/action/sort groups together while allowing reflow at larger text sizes. `DismissibleDetails.viewportPanel` keeps a single direct child panel inside viewport gutters, responds to the visual viewport, and retains nonmodal outside/Escape dismissal. It does not assign menu roles to forms or ordinary links. Native disclosure summaries use a text wrapper and one trailing chevron with the shared open-state treatment.
