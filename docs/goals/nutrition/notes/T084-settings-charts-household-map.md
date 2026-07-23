# T084 remaining settings, charts and household map

This is a read-only map against the original Nutrition brief after T083. It corrects earlier broad wording where storage capability was mistaken for a complete user workflow.

## Requirement-to-evidence map

| Area | Current evidence | Remaining gap |
| --- | --- | --- |
| Private profile fields | Schema, validation and optimistic update service already model display/avatar/link/type, birth date, height/current/target weight, units, reference sex category, activity, goal type/date, explicit life stage, dietary preferences/allergies/exclusions, estimator consent flags, weight tracking, comparison/diary visibility, energy unit, timezone, week start and jurisdiction. | Nutrition UI exposes only display name/type creation. There is no complete private settings form or explanation-before-sensitive-input flow. Sharing APIs/history exist but no usable owner-facing management UI. |
| Manual and estimated goals | Strict versioned target/minimum/range/limit rows and manual goal UI exist. Reference metadata/disclosure and an FDA label-reference dataset exist. | No server-owned personalized target-selection or energy-equation engine exists. Enabling the stored estimator flag creates no goal. FDA DV must not be presented as a personalized DRI. Numeric DRI/EER packages still require a separately sourced/reviewed package. |
| Preferences and display choices | Dietary preference/exclusion/allergy fields and configurable recipe-card nutrition fields exist in separate surfaces. | Recommendation filtering uses allergies and exclusions but not positive preference matches. Nutrition-visible nutrients, trend range, dashboard/card/planner display flags and source/recommendation preferences are not persisted as profile settings. |
| Overview and individual charts | Overview separates consumed/planned/Pantry, shows key totals, quality, meals, insights and recommendations. Trends has one seven-day calorie bar with a table and missing-day semantics. Core helpers cover macro energy, rolling average and coverage status. | Date selection/toggle and the required calorie bullet, macro composition, calorie/macro trends with 7/14/30 ranges, coverage bars, optional heatmap/table, planned-versus-consumed, source ranking, opt-in weight trend and completeness datasets/views are absent. The existing bar lacks target band, planned calories, rolling average and explicit incomplete-day encoding. |
| Household privacy and normalization | Server filters hidden profiles, enforces comparison grants, anonymizes labels, requires three observed days/0.5 coverage, and returns no diary rows or measurements. UI labels percentages against each member’s own goal. | There is no multi-select/date-range control, planned view, meal allocation, household completeness view, operational recipe/grocery implications or household chart/table set. Range and limit semantics are collapsed to a single boundary and labeled “% of goal”; each semantic needs distinct normalized status. |
| Data rights/offline/performance/docs/evidence | Export, correction/deletion lifecycle, stable command IDs, full unit/integration gates and a production build exist. | Offline diary/allocation queue and conflict replay are absent. No explicit performance budget for Nutrition aggregate/chart/household queries exists. Shared API/data-model/reference/formula/security docs are incomplete. No isolated Nutrition Playwright/a11y/responsive workflows prove the four required journeys. |

## Exact first bounded Worker

Build a private profile-settings surface using only the already modeled and validated profile fields. Add a `Settings` Nutrition view available only to `canManageProfile`; load the complete private profile server-side with `getPrivateNutritionProfile`; render a dedicated accessible form that sends the existing trusted-origin, optimistic-version `PATCH` contract; explain why date of birth, body measurements, source sex category, activity and explicit life stage are requested before those inputs; keep every field optional unless the user explicitly enables estimated-target inputs; make unit, timezone, week start, diet/allergy/exclusion, weight tracking and comparison/diary visibility controls truthful; and state clearly that saving estimator inputs does not itself generate or replace goal versions. Do not add reference numbers, derive a medical property, change permissions, add a migration or claim estimated goals are applied.

Allowed files:

- `src/app/nutrition/page.tsx`
- `src/components/nutrition-dashboard.tsx`
- `src/components/nutrition-dashboard.module.css`
- new `src/components/nutrition-profile-settings.tsx`
- new `src/components/nutrition-profile-settings.module.css`
- `tests/unit/nutrition-components.test.ts`

Verification: focused component/render/payload tests, existing profile schema/service/API tests, full unit/integration tests, lint, typecheck, scoped formatting/diff and production build. Stop for schema/API/service changes, permission-management behavior, target generation, browser persistence of private truth, broad profile reads or Pantry-owned edits.

## Sequential remaining phases

1. Judge the private settings boundary, then deliver the settings Worker above.
2. Source and review a versioned personalized reference/energy package before implementing any estimator or reference-derived goal application.
3. Add explicit profile display-preference persistence and individual chart datasets/components with table equivalents and semantic tests.
4. Expand household comparison into selected-range planned/consumed/allocation/completeness and target/range/limit-normalized datasets, then add accessible small-multiple/matrix/table UI without hidden-detail leakage.
5. Add the bounded offline command queue only if it can reuse the current PWA safely; add query-count/performance fixtures and invalidation evidence.
6. Complete shared documentation, isolated workflow E2E/a11y/responsive evidence, migration/build gates and the full T999 oracle.

Pantry parallel safety is true for the first settings Worker: active Pantry T045 owns a one-file browser locator/evidence task, while this package is confined to Nutrition page/components/tests and performs no Pantry, planner, shopping, schema or service mutation.

The exact GoalBuddy Scout exceeded the single 30-second wait and was interrupted. The PM completed the same read-only map as permitted fallback.
