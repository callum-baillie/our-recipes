# Meal planner UI contracts

The planner keeps its focused desktop workspace, with the header and flexible main sharing the available height. Short desktop viewports allow the workspace to scroll in content order instead of collapsing the calendar. Below 75rem of effective viewport width (including text enlargement), it uses the calendar and readable agenda. Phone pages flow normally; larger focused workspaces retain bounded scrolling. Reuse the shared page header, fields, semantic theme colours, native disclosures and `AppDialog` lifecycle.

## Calendar, focus and setup

- The URL's `date` is the selected calendar date, independently of the visible day/week/month period. Mode changes preserve it; period arrows retain the weekday or clamp the day of month to an available date. Today and Go to date navigate explicitly. Dates use local ISO date arithmetic and UTC formatting of those date-only values, avoiding timezone shifts.
- Mobile Week exposes all seven dates. Month exposes every date, including empty ones, using the configured week start. Selection and today have separate pressed/current treatments and full announced dates. Native buttons remain keyboard reachable.
- Desktop month uses a compact weekday header, intrinsic day rows, at most two title previews, and a labelled day destination with the complete meal count. No third entry is hidden without a route to the full agenda.
- Week cards use a 3.75rem photo strip; day/mobile cards use a thumbnail alongside content. Titles reflow, actions have a reserved target, and metadata never covers identity. The default shared-household caption is visually quiet in compact cards. Full action identity and Pantry status remain available in the action dialog.
- Setup dates, meal selections and people are defaults for new additions/generation. They do not reschedule or change existing entries, and do not change the displayed calendar or nutrition profile. The inclusive setup range is validated as 1–14 days. Generation supports 1–5 meal types, up to 70 slots; candidate, allocation and conflict limits agree with this bounded request.
- Setup is retained in session storage across view changes and the explicit Manage people / Back to configured plan detour. It is temporary browser setup, not a saved household preference. Calendar data and setup storage have separate lifecycles.

## Household meal types

Acknowledged preferences and the editable type draft are separate. Opening the editor does not change calendar rows. Save freezes the submitted controls until acknowledgement; failure retains the draft and adjacent error. Cancel discards the draft, and dismissing a dirty editor asks explicitly. Outer Close settings does not imply a preference write.

Planning selections specify which types new meals should fill. Visibility preferences specify household rows. Selected or in-use rows remain available, including historical custom identifiers removed from the vocabulary; removal never deletes meals. Custom entry validates a usable identifier, duplicate label, 48-character name and ten-custom-type capacity. Remove is outside its checkbox label and returns focus to custom entry.

## Add, edit and actions

- Header Add a meal uses the focused date; slot entry uses its clicked date/type. Choose meals for range opens the existing multi-date assignment flow.
- The picker announces the current target before results and when selection advances. Suggestions and whole-recipebook scope are distinct from collection membership. Secondary filters and alternatives share a compact control row, expanding to the full width when open. Assignment review is a disclosure; meal choices use pressed buttons rather than incomplete tabs.
- Each recipe result is one button with a thumbnail, wrapping identity, classification, truthful duration and selection state. There are no nested buttons.
- Picker selections are temporary. Closing retains the same mounted context; changing date/range/types, navigation or reload discards them, as stated beside submitted selections. There is no misleading Save draft action. Success clears committed assignments. Validation failure retains them. An unconfirmed network outcome blocks resubmission and directs the user to check the calendar.
- Alternate-kind handoff carries the active target separately from the selector key, preserving its assignments when returning from an unsaved alternate editor. Single food/drink, choose-one options, fasting/no meal, leftovers, eating out and other meals stay available without saved recipes.
- Editing puts identity and scheduling first, with an affirmative shared-household audience. Audience and serving quantity stay separate. Blank intermediate serving input is retained and validated at commit. Busy fields are frozen; failures preserve drafts and revision checks. Adaptation is local to the planned meal, and toggling it off retains its draft until save/cancel.
- Meal actions are owned once at planner level, outside responsive calendar branches, so resizing cannot hide an active dialog. They use one labelled shared modal, with bounded body scrolling and a persistent close header. Rescheduling is a disclosure. Status saves immediately; Move and Swap require their buttons and use full destination dates. Native drag alternatives, removal confirmation, versions and supported Undo/Redo remain intact.
- Duplicate to next day uses the actual next date, including outside the visible range and across years; feedback links to that date. Copy to next week is explicitly additive, resets statuses to planned and has no ordinary Undo. It preserves audience, options, snapshots, portions, adaptation and valid leftover relationships.
- Calendar saving is a read-only acknowledgement status, including Needs attention after an unconfirmed/failed change. Refresh is separate. Preference drafts have their own save boundary.

## Plan overview

Mobile retains grocery creation for the **displayed period**, including the returned list identity and restored notice. Pantry counts describe ingredient demand entries: covered, confirmed short and needs review/matching. Unmatched or unconvertible amounts are not measured shortages; no denominator means unavailable coverage.

Nutrition identifies the active person and displayed period. Each daily average uses only known finite values for that nutrient. Unknown values have no zero/progress treatment. Minimum, range, limit and target comparisons are named; only target comparisons use a progress bar. Targets and minimum goals use their stored `value`; ranges use both bounds and limits use `maximum`. Planned estimates remain distinct from logged meals.

## Generation and confirmation

One generator instance hands off with settings through one active `AppDialog`. Busy Escape cannot dismiss a parent. Opening, route switching and options never initiate generation. Saved recipes are the initial route; each route retains its options.

Recipebook mode plus `generateMissingRecipes` means **optional** paid fallback, rather than requiring both saved and generated recipes. Complete saved coverage skips AI, and zero saved candidates can reach an explicitly enabled fallback. Historical recipebook gaps and final proposal completeness are reported separately. Cost uses the existing dated estimate model; refinement does not change or independently reprice its amounts.

Retained proposals keep their submitted dates, people and meal types, even when setup changes. Back to options preserves the result and conflict choices. Replacing a retained result is deliberate. Preview exposes new-recipe ingredients/method/times, saved-recipe links, assumptions, warnings and unresolved choices. Keep shows retained identity, excludes candidate allocations, and only promises leftover links whose two proposed endpoints will be inserted. All-keep creates no new recipes/calendar entries/portions and offers no misleading save mutation. When multiple existing meals share a slot, any Keep suppresses the proposed insertion; other explicit Replace choices still remove those entries from the active plan, retaining cancelled history when required by existing allocations. Preview identifies that removal-only result before confirmation.

Confirmation retains server concurrency checks and transactional writes, and can save recipes, schedule entries, create planned portions/leftover links and prepare the plan's grocery list. Optional image jobs run after commit; failure never requires regenerating or duplicating the plan. Generating itself stores a proposal, not recipes or calendar entries.

## Review and insight

Single-task meal comparison skips the redundant task selector. It ranks saved recipes using permitted profile/Pantry evidence; remembering an assessment does not schedule a meal. Mobile has the same independent flow. Opening and expanding initiate no paid request.

AI planning summary is only shown when a saved summary exists. Generation time and period come from stored metadata, independently of the visible calendar. It is not an editable notes area or an automatically refreshed calendar total. Expanding never regenerates it.

The shared modal focus hook excludes controls disabled by a fieldset, includes visible native summaries/fixed controls, and restores focus when a busy render disables the active button. Header navigation wraps rather than overlapping at increased text sizes; mobile controls retain a contained disclosure and comfortable targets.

## Version comparison and regression coverage

The comparison baseline is `c7e5433781fc8e34bcce2b600dd38eff485e8949`, with the earlier batch foundations in the working tree. Preserve the improvements already present there: intrinsic weekly row growth, bounded mobile action scrolling, native date presets and nested Escape handling, correctly sized settings checkboxes, expected-update checks, removal confirmation, Undo/Redo, explicit camera/paid boundaries, and transactional proposal confirmation with post-commit image jobs. The historical desktop generator captures did not show its dialog; rendered desktop generation is checked directly.

Focused coverage lives in `tests/unit/planner-workflow.test.ts`, `tests/unit/planner-components.test.ts`, `tests/unit/modal-focus.test.ts`, `tests/integration/ai-assistant-service.test.ts`, `tests/integration/meal-plan-nutrition-allocation.test.ts`, and `tests/e2e/planner-redesign.spec.ts`. Provider fixtures are deterministic. Test kitchens and screenshot artifacts stay outside the repository; no production calendar or Pantry mutation is needed.
