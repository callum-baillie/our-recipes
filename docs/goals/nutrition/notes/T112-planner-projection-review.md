# T112 — planner preview and bounded projection review

## Decision: approved

The deferred planner slice is approved with a five-query maximum:

1. Profile row for `view_diary` authorization/context.
2. Latest permission history for that profile.
3. One range-bounded planned-status meal query joined to each recipe's latest calculation, calculation source/version, and all nutrient values.
4. One range-bounded query for only the latest allocation revision per series on those planned meals.
5. One timestamp-envelope query for latest eaten/corrected intake revisions and nutrient values, filtered afterward to exact profile-local range dates.

The service must return `confirmedTotalsByDate` alongside planned totals so `/planner` removes its current all-profile-history intake read. The calculation join may use `presentRecipeNutrition()` for exact current/stale/unavailable warnings while using the same joined rows to scale all nutrient codes, not only the six compact card codes.

Meal-plan entries with status skipped or cancelled must be absent from planned projection/totals. Latest allocation semantics remain:

- planned and served count in planned nutrient totals;
- eaten, skipped, and leftover do not;
- skipped does not occupy serving capacity;
- eaten and leftover preserve occupied historical capacity;
- all other profiles contribute only anonymous assigned totals, never identity or private details.

The page continues to select only a diary-visible profile from the signed principal's accessible list, and the service independently reauthorizes. Household planner headcount stays separate.

`showMealPlanNutrition` may hide only the planned/confirmed metric comparison and each meal's per-person nutrient preview/warning. It must not hide:

- explicit fractional allocation controls;
- total/assigned/unassigned/overallocated servings;
- current/stale/unavailable calculation quality needed for prepared evidence;
- prepared-batch controls or the factual statement that planning/serving is not eating;
- empty/status/accessibility states.

## Worker boundary

Allowed files:

- `src/app/planner/page.tsx`
- `src/components/nutrition-meal-planning.tsx`
- `src/components/nutrition-meal-planning.module.css`
- `src/lib/services/nutrition-meal-planning-service.ts`
- `tests/unit/nutrition-recipe-components.test.ts`
- `tests/integration/nutrition-meal-planning-service.test.ts`

Verify max-five query count, large irrelevant old history, exact local dates, latest allocation corrections, skipped/cancelled meal exclusion, all nutrient values, stale/unavailable, fractional portions, other-profile anonymity, preview on/off, retained controls/unassigned/quality, full tests/lint/typecheck/build, and scoped formatting/diff.

Stop if schema/migration/API/intake/allocation/planning/Pantry persistence or household comparison files must change, if authorization exceeds the approved seam, or if planned becomes consumed.

The exact GoalBuddy Judge timed out and was interrupted; this PM fallback applied the same read-only gate.
