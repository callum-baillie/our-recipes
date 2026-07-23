# T096 advanced individual-chart and preference map

## Current boundary

- `nutrition_profiles` already owns current display-adjacent settings (`measurementSystem`, `preferredEnergyUnit`, timezone, week start and `weightTrackingEnabled`) behind one optimistic `version`. The validated full-profile PATCH requires signed Nutrition identity, exact trusted origin and `manage_profile`; `profileValues` is the single persistence mapper. No visible-nutrient, trend-range, macro-mode or chart-surface preference exists.
- The private Settings form round-trips the complete profile through that PATCH. Extending the existing profile row/schema/form is safer than adding an unaudited browser store or a second preference API. New fields need defaults so migration of existing profiles is deterministic. Accessible profile summaries may expose only non-sensitive display preferences needed for authorized diary rendering.
- The page currently loads every intake revision and builds a seven-day summary in memory. The summary correctly selects the latest series revision, excludes skipped/deleted current rows, preserves missing energy days as `null`, and uses the profile timezone, but exposes only daily energy plus today's aggregate quality. It is not yet a bounded multi-nutrient aggregate service.
- Intake snapshots already retain source type/name, recipe/product/calculation identities and per-nutrient amount/confidence/completeness. These are sufficient for authorized source ranking after a bounded latest-revision query; no current chart should read mutable recipe/product nutrition.
- Meal projections remain separate and range-bounded, but the current service loads allocation/calculation details with per-meal work. It is acceptable for seven visible days today, not yet an approved 30-day chart query.
- Goal rows are append-only series. Historical chart selection must be per series and per day: choose the highest revision whose `startsOn` is on/before that day (and whose optional `endsOn` still contains it), then honor that selected revision's active/paused/archived state. Selecting today's latest goal for every historical day would rewrite context.
- Measurements are separately authorized by `view_measurements`; Settings management does not imply every viewer may see them. Weight data may be loaded only when `weightTrackingEnabled` is true and the signed principal has measurement access. Observations, seven-day smoothing and an optional user-entered goal must remain distinct.

## Required dataset semantics

- Calorie/macro trend: 7/14/30 local dates, confirmed daily values with missing `null`, planned totals separate, historical goal band/context per day, rolling average that skips missing values without manufacturing zeros, and daily completeness. Macro percentages exist only when protein/carbohydrate/fat are all present; grams and calculated-percent modes remain explicit.
- Heatmap: selected nutrients by local day, semantic target/minimum/range/limit status from that day's goal version, plus separate missing/incomplete states and a table equivalent.
- Planned versus consumed: separate grouped values by day initially. A by-meal view requires preserved meal-plan linkage and must not infer a match from a meal-slot label.
- Sources: for one selected nutrient, group current confirmed snapshots by immutable source identity/name/type; show exact amount and proportion of recorded total, never a health score. Links may expose only data already authorized with the diary.
- Completeness: `missing` means no current confirmed diary row for the day. Any stronger label must be “record completeness,” not proof that every meal was logged. Fully documented requires explicit selected nutrient values with complete evidence; otherwise partial. Average nutrient completeness remains numeric and separate.
- Weight: opt-in and separately authorized; points are measurements, the primary line is a trailing seven-day observation average, and a configured goal is not a projection. The vertical domain must include the observations without exaggerating differences.

## Query and performance boundary

The later aggregate service should accept a validated 7/14/30 range and selected bounded nutrient list and return all individual chart datasets in a bounded number of queries (target at most 10 regardless of diary row count): authorization/profile, current intake revisions via latest-per-series SQL, nutrient values in one bulk query, goal history, bounded meal projection/allocation/calculation data, and optionally measurements. It must not call the current per-row `intakeView` loop or recalculate whole household history. Index adequacy and query-count regressions belong in that Worker.

## Largest safe next package

Before the aggregate service, deliver one additive profile-display preference vertical using migration `0024` and the existing optimistic full-profile seam:

- validated/deduplicated `visibleNutrientCodes` restricted to canonical codes with a bounded count and a factual default selection;
- `trendRangeDays` restricted to 7, 14 or 30;
- `macroTrendMode` restricted to grams or calculated-percent energy;
- `showPlannedNutrition` as the current Nutrition dashboard/trend display toggle.

Apply the visible selection to goal-backed coverage without hiding the explicit empty state, apply the range to the current timezone-aware trend and dynamic table/title text, and apply the planned toggle only to presentation (never delete or reclassify planned data). Expose the four controls in private Settings with clear copy. Do not add card/planner flags until those surfaces have an explicit authorized Nutrition-profile selection; persisting non-operative switches would be misleading.

Likely allowed files: `drizzle/0024_nutrition_display_preferences.sql`, `drizzle/meta/_journal.json`, `src/lib/db/schema.ts`, `src/lib/domain/nutrition-profile.ts`, `src/lib/services/nutrition-profile-service.ts`, `src/app/nutrition/page.tsx`, `src/components/nutrition-profile-settings.tsx`, `src/components/nutrition-dashboard.tsx`, `src/components/nutrition-chart-panels.tsx`, `src/lib/domain/nutrition-chart-datasets.ts`, and focused profile/service/component/chart tests. No new API route is required because the existing PATCH already validates origin, principal, authorization and optimistic version.

Verify old-row migration defaults, validation/deduplication/bounds, optimistic conflict and unauthorized denial, exact full-profile round-trip, selected coverage, 7/14/30 missing-day behavior, dynamic accessible text/table scope, planned presentation suppression without data mutation, fresh migration/database check, full gates and build. Stop for applied-migration edits, preference data in browser storage, client totals, historical-goal implementation, measurement loading, aggregate/source service, card/planner surface changes, Pantry/household changes or files outside the approved package.

After this package: Judge the preference vertical; build and audit the bounded aggregate/source service plus calorie/macro/heatmap/planned/completeness views; then separately deliver authorized opt-in weight; then rendered a11y/responsive evidence and household analysis.
