# T092 individual chart requirement and data map

This is a read-only map of the ten required individual chart families after T091.

| Chart | Current trustworthy inputs | Gap / safe disposition |
| --- | --- | --- |
| Daily calorie progress | Today's confirmed `energy_kcal`, today's separate planned projection, active versioned energy goals, quality summary | No bullet/progress dataset or ambiguity handling when multiple energy goals exist. Safe first Worker. |
| Macro distribution | Pure `macroEnergyDistribution` requires protein/carbohydrate/fat and optionally alcohol; today's confirmed totals exist | No rendered stacked composition, grams, missing-macro state or target-range context. Safe first Worker. |
| Calorie trend | Seven-day consumed energy retains null missing days; rolling-average helper exists | Current visual omits planned values, target band, rolling average, incomplete encoding and 14/30 controls. Requires richer per-day dataset. |
| Macro trend | Current diary revisions contain nutrient values | Summary exposes only per-day energy. Requires server-built per-day nutrient totals/completeness plus grams/%-energy modes. |
| Nutrient coverage | Current confirmed totals, target/minimum/range/limit goal versions and definitions exist | No semantic progress dataset or customizable selection. Safe first Worker for goal-backed nutrients only; do not collapse range/limit semantics. |
| Nutrient heatmap | Diary revisions, goals, timezone and completeness exist | Requires per-day/per-nutrient status matrix, selected nutrients and table equivalent. Advanced later Worker. |
| Planned versus consumed | Current meal projection and diary revisions remain separate | Needs matched day/meal datasets and date controls; must not net one into the other. Later Worker. |
| Nutrient sources | Frozen intake values retain source names/types and recipe/product identities | Needs selected nutrient aggregation/ranking and permission-safe links/table. Later Worker. |
| Weight trend | Authorized measurement service and weight-tracking opt-in exist | Page does not load measurements and no rolling series/goal line exists. Separate privacy-sensitive Worker. |
| Data completeness | Intake nutrient values retain completeness/confidence and diary state by date | Current dashboard exposes only one aggregate. Needs fully/partially/missing day rules and calendar/table. Later Worker. |

## First bounded chart Worker

Create a pure server-run chart-dataset module and a dedicated accessible chart-panel component for three high-value views using only data already loaded on `/nutrition`:

1. Daily calorie bullet/progress: confirmed consumed, separate planned amount, exactly one current configured/estimated target when unambiguous, remaining/above text, recent data completeness, date/person scope and table.
2. Confirmed macro composition: 100% stacked horizontal bar for protein/carbohydrate/fat/alcohol only when required macros exist, with grams, calculated energy, percentage text, non-color labels and table; missing inputs produce an explicit incomplete state rather than zero composition.
3. Goal-backed nutrient coverage: horizontal bars/tables with distinct target/minimum, range and limit labels/status/formulas, units, missing state and no moral red/green encoding. Render a concise default subset and all current goal-backed rows on the Nutrients view; defer persistence/custom selection.

The server page must construct datasets. Browser components render only passed values. No schema, API, service, profile settings, measurements, longer-range queries, Pantry, planner or recommendation changes are needed.

Allowed files: new `src/lib/domain/nutrition-chart-datasets.ts`; new `src/components/nutrition-chart-panels.tsx` and module CSS; `src/app/nutrition/page.tsx`; `src/components/nutrition-dashboard.tsx`; `tests/unit/nutrition-chart-datasets.test.ts`; `tests/unit/nutrition-components.test.ts`.

Verify target/range/limit and ambiguous/missing/partial formulas, macro completeness and percent-energy math, planned/consumed separation, accessible titles/summaries/units/table/empty states, responsive overflow, focused/full tests, lint/type/format/build. Stop for client-owned totals, multiple-goal guessing, planned-as-consumed, identical semantic labels, decorative gauge/donut, schema/service/API/Pantry overlap or inaccessible color-only output.

## Remaining sequence

1. Judge and deliver the first three server-owned panels.
2. Add versioned profile display preferences (visible nutrients, trend range, dashboard/card/planner flags) in an additive persistence package.
3. Build a bounded 7/14/30 per-day aggregate/source service with query-count budget, then calorie/macro trends, heatmap, planned-versus-consumed, source and completeness panels/tables.
4. Add opt-in authorized measurement loading and weight trend.
5. Rendered a11y/responsive/keyboard proof, followed by household analysis.

Parallel safety is true against active Pantry T045 because the first chart package is Nutrition-domain/page/component/test only and does not touch Pantry or its browser workflow.

The exact GoalBuddy Scout exceeded the single 30-second wait and was interrupted. The PM completed the same read-only map as permitted fallback.
