# Nutrition task surfaces

Nutrition uses the standard page shell and shared `PageHeader`, native `AppDialog`, disclosure row, button, field and theme tokens. The active household profile remains the only identity selector. Profile details explains that workflow; it does not create another profile state or permission boundary.

## Today and diary

- Today starts with consumed food. Empty intake has one explanation; known zero, unknown nutrients, partial sums and missing goals remain distinct.
- `nutritionGoalComparison` is shared by the headline and exact data. It applies the observation date and effective goal dates, reports competing current goals, and preserves target, minimum, range and limit meanings. Planned values never enter its consumed comparison.
- Recording completeness and source confidence are separate, personal, dated measures. Household profile counts do not claim household recording coverage.
- Recent diary history labels corrected, skipped and deleted states and links to the actual diary day. Only the latest eaten/corrected revisions contribute to consumed totals.
- Diary has one date group. Export is a secondary tool and exports the selected profile's nutrition data, beyond the visible day.
- Optional setup, measurement history, insights and deeper evidence follow daily tasks. Contextual review remains available on mobile and does not implicitly schedule or log food.

## Recording and recovery

`NutritionRecordForm` supplies both modal and inline Copy/skipped forms. Record types have distinct titles, person/day context, validation and local feedback. A bounded scrolling body and persistent action footer keep long forms usable. Fields freeze during submission, and the synchronous request lock prevents rapid duplicate activation.

`useNutritionDraft` retains bounded, incomplete drafts in this browser tab, scoped by person, task, day and selected source. Back, Close and recovery navigation preserve them. Only an acknowledged commit clears its draft. Storage failure leaves editing usable, displays a warning and protects reload/close while dirty. A recovered draft requires review of its date and values.

`useNutritionRequest` binds each response to its original scope. A late response cannot reset a newer person's form. Validation errors retain input. An ambiguous mutation outcome requires checking saved data; ordinary intake is not automatically retried. Exact-command replay is used only by endpoints that support it. An uncertain copy/prepared request freezes its submitted draft and offers an exact retry with the retained operation key. Starting a different request requires an explicit check-and-reset action.

Event date and time are entered in the profile's reset timezone. Historical dates remain selected; today's current-time shortcut is explicit. Missing daylight-saving clock times are rejected. A repeated time requires the earlier/later choice. Copy day transfers source local meal times to the destination zone, uses the earlier repeated occurrence, and rejects nonexistent destination times transactionally with recovery guidance.

## Food and measurement meaning

- Product recording uses saved nutrition records. Offered units come from the existing supported conversion function; no density, piece weight or serving conversion is invented. The selected source, reference basis and coverage remain visible. Intake does not deduct Pantry stock.
- Recipe recording uses exactly one serving or weighed basis supported by the selected calculation snapshot. Calculation recovery opens the actual maintenance task and retains the logging draft.
- Manual nutrients are totals for the entire amount consumed. Changing quantity does not multiply values. Any nonempty known subset is valid, including explicit zero; blanks stay unknown.
- Copy appends eligible snapshots and reports the returned count and destination. Zero results retain useful input. Cross-person navigation uses the global profile workflow.
- Skipped meals add history without nutrients or planner changes.
- Weight and advanced mass fields follow the selected observation unit; switching kg/lb converts the physical quantity. Percentage/index fields retain their dimensions. Optional fields remain absent when blank. Recorded and calculated measurements have separate provenance/date labels. Scale checking, disconnection and failed checking are distinct; sync remains explicit.

## Goals and estimates

Examples populate a draft only. Save goal either deliberately adds a series or supersedes the exact selected latest goal version. History remains available separately. Pending/errors belong to this dialog.

An estimate records its profile version, activity, effective date, pace and saved weight direction. A changed basis makes the result stale. Applying a reviewed estimate to the draft does not save it. The existing internal estimate apply command now optionally accepts **both** `planningAdjustmentKcal` (-500, -250, 250 or 500) and `reviewedTargetKcal`. The server recomputes maintenance using the existing formula, validates direction, exact reviewed target, profile version, consent, permissions and goal supersession, and stores the reviewed adjustment in source evidence. Omitting both fields retains maintenance-only application. Exact operation replay must match this evidence. No new formula or personal target is introduced.

## Maintenance, planned portions and preparation

Maintenance has explicit Log food, Edit product nutrition and Calculate recipe nutrition tasks. Label corrections prefill all known nutrients and evidence; blank replacement values are explicitly omitted. Reference changes require review. Only relevant conversion fields appear; quality/evidence controls have explained advanced treatment. Saving source data or a calculation never logs food.

Planned previews honour the active person's preference. Range averages use only dates with usable values for each nutrient; meals without a personal planned/served allocation do not manufacture known zero. Portion management remains available when previews are hidden and opens directly on meals. Shared serving capacity and a person's saved portion/state remain visible even without nutrient evidence. Eaten allocations route to diary correction.

Prepared inventory is independent of the selected diary day. Its form deliberately reviews the receiving person, event date and one supported basis. Save portion state is separate from Confirm eaten. Matching snapshots, preparation evidence, capacity, exact version and replay protections remain authoritative. Empty inventory links directly to open planned-portion management. Feedback belongs to each meal/portion; empty status regions have no visible decoration.

## Verification approach

Use isolated databases and deterministic responses. Do not use real food/weight entries, scale sync or paid generation for UI checks. Regression coverage includes profile-local times and clock changes, unknown/zero averages, goal kinds/effective dates, partial draft restoration, request ownership/duplicate guards, full-amount manual totals, exact copy retry/counts, selected weight-unit conversion, goal draft/supersession and adjusted-estimate evidence/replay. Existing Nutrition service/API suites protect immutable history, permissions, snapshots, capacity and consumption boundaries.
