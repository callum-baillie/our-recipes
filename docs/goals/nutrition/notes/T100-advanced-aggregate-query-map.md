# T100 bounded advanced individual aggregate map

## Exact service boundary

The current page calls `listNutritionIntakeRevisions`, which loads all revisions and performs one nutrient-value query per row. It is correct for current behavior but cannot back 30-day multi-chart views. Existing indexes are sufficient for a bounded replacement without another migration:

- outer intake candidates use `nutrition_intake_profile_occurred_idx`;
- a correlated `NOT EXISTS` newer-revision check uses the unique `(series_id, revision)` index and is evaluated before exact local-date filtering;
- nutrient values join by the `(intake_revision_id, nutrient_code)` primary key;
- goal rows use the existing profile index and are bounded to selected nutrients;
- allocation latest-version checks use the unique allocation series/revision index, while plan rows use their existing planned-date path.

Create one server-only `getIndividualNutritionChartWorkspace(profileId, principalId, input)` service. Validate exactly 7/14/30 days and one to twelve canonical selected nutrients. Authorize once through `authorizeNutritionProfileAction(..., 'view_diary')`; this uses the signed principal profile/grant seam. A diary-authorized view may receive only the goal rows required to interpret that diary, never private profile inputs or measurements.

Use a fixed five-query ceiling independent of diary/meal row count:

1. authorization profile lookup;
2. latest permission versions lookup;
3. one static joined intake/value query for latest current rows in a conservative UTC envelope, followed by exact `nutritionLocalDateKey` membership;
4. one selected-nutrient goal-history query;
5. one joined latest-allocation/current-recipe-calculation/value query for the bounded plan range.

The intake SQL must rank by correlated newer revision before range/state acceptance so a moved or deleted newer revision cannot leave an older row looking current. It returns eaten/corrected rows only after latest selection and left-joins values so a confirmed entry with no selected nutrient remains visible to completeness logic. The planned SQL accepts only latest `planned`/`served` allocations, current-recipe-revision calculations with a valid positive serving count, and selected/required nutrients; unavailable calculations remain explicit missing projection evidence. It never calls the current per-meal presentation/calculation helpers.

## Server-owned dataset rules

- Date keys are exact profile-local days ending on the requested date. Missing confirmed data remains `null`; planned remains separate. All charts carry person/date-range scope and record-quality context.
- Historical goal context is chosen per series and day: among versions whose start/end window contains the day, select the highest revision, then honor that selected version's active/paused/archived state. A later paused/archive version suppresses the older active version; a future version does not rewrite earlier days.
- Calorie trend returns confirmed, separately planned, historical target/minimum point or range/limit band, daily record completeness and a trailing seven-day average of present confirmed values only. A missing day does not contribute zero or a denominator.
- Macro trend returns protein/carbohydrate/fat grams and calculated-percent energy for days where all three required macros exist; alcohol is optional. Browser controls select an already-built grams or percent representation and do not calculate authoritative values.
- Heatmap cells use that day's historical target/minimum/range/limit semantics and separate `missing_value`, `incomplete_evidence`, below/met/within/above states. A table equivalent retains amounts, bounds, units and evidence completeness.
- Planned versus consumed returns separate grouped values by day for energy, the three macros and selected nutrients. It does not net, stack or infer consumption from a plan. A by-meal comparison stays deferred because exact preserved plan linkage needs a separate UX decision.
- Source ranking groups one selected nutrient from immutable current confirmed snapshots by source type and stable source identity/name. It returns exact amount and percent of the recorded nutrient total, with authorized recipe/product links only where stored IDs exist. Manual entries are factual snapshot labels; no health score or mutable recipe lookup is used.
- Record completeness uses three labels only: `missing` when no current confirmed entry exists, `fully_documented` only when every current confirmed entry has every selected nutrient with completeness 1, and `partial` otherwise. Copy must state this is evidence completeness, not proof every meal was logged.

## Largest safe Worker

Deliver the five-query service, pure dataset builder and one accessible Trends-view component. Keep the existing Overview panels. On Trends, render calorie and macro trends plus planned-versus-consumed and record completeness; place source ranking and semantic heatmap in clearly labeled advanced disclosure sections to avoid a wall of charts. Every visual needs exact non-color text and a table equivalent; small screens stack/scroll. Macro grams/percent selection may be local render state only because both representations come from the server dataset. Source nutrient selection may use an already-validated selected list without a new API.

Likely allowed files: new `src/lib/services/nutrition-individual-chart-service.ts`, new `src/lib/domain/nutrition-advanced-charts.ts`, new `src/components/nutrition-advanced-chart-panels.tsx`, new module CSS, `src/app/nutrition/page.tsx`, `src/components/nutrition-dashboard.tsx`, new unit/service tests and `tests/unit/nutrition-components.test.ts`. No schema, migration, API, preference, measurement, existing intake/planning service, card/planner, Pantry, recommendation or household file should change.

Verification must cover moved/deleted newer revisions, local-midnight/DST dates, missing values, historical goal supersession/pause/future starts, rolling-average gaps, macro completeness and both modes, semantic heatmap, planned separation/unavailable calculations, source grouping, strict completeness labels, unauthorized denial, the fixed five-query code path, large bounded fixtures, accessible table/disclosure/responsive rendering, full gates and build.

After audit, deliver weight as a separate `view_measurements`/opt-in slice, then card/planner preference integration, rendered individual a11y evidence and household analysis.
