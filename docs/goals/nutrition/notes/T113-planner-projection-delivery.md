# T113 — bounded planner Nutrition delivery

## Outcome

Replaced planner all-history and per-meal reads with a fixed five-query server projection and applied the profile's preview preference without weakening serving controls.

## Server path

1. Profile access/context query.
2. Latest permission-history query.
3. Range-bounded `status='planned'` meal rows joined to latest calculation metadata and all nutrient values.
4. Range-bounded latest allocation revision per series for planned meals.
5. Range-bounded latest eaten/corrected intake revisions and nutrient values, then exact profile-local date filtering.

The service returns planned and confirmed totals separately. `/planner` no longer loads the selected profile's complete intake history. Calculation presentation still uses the shared current/stale/unavailable domain semantics, while scaling uses every joined nutrient value.

## Semantics and privacy

- Skipped/cancelled meal-plan entries do not appear or count as planned.
- Planned/served allocations count toward planned nutrients; skipped/leftover/eaten retain their existing planned/capacity semantics.
- Fractional allocations remain explicit. No equal split is inferred.
- Other profiles affect only anonymous assigned/unassigned capacity; IDs and names are not projected.
- Confirmed totals use latest eaten/corrected series only and exact local dates; planned/served allocations never become confirmed intake.
- Existing public error behavior for unauthorized diary access is preserved.

## UI preference

When `showMealPlanNutrition` is false, the day metric comparison and per-meal nutrient preview/warning are replaced by a calm preference note. Total/assigned/unassigned/overallocated servings, allocation forms, calculation quality, prepared-batch controls, empty/status states, and the explicit not-eaten language remain.

## Verification

- Focused planner service/component suite: 8 tests passed.
- A regression proves exactly five prepared statements, exact Los Angeles midnight filtering, 200 irrelevant historical meals/allocations, skipped-meal exclusion, and all-nutrient scaling.
- Full suite: 225 unit and 129 integration tests passed.
- Typecheck, lint, focused formatting, and production build passed.
- Lint reported one concurrent Pantry unused-parameter warning; no error. Build retained the pre-existing backup-service NFT trace warning.

## Concurrent integration note

Pantry T070 began a separate migration 0026 after T110. The duplicate journal index/tag numbering is outside T113's allowed files and must be coordinated after Pantry releases schema/journal ownership. T113 did not touch those files.
