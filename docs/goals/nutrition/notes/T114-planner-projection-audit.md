# T114 — bounded planner projection audit

## Decision: approved

- The service performs exactly five prepared statements on an authorized path: profile, grants, range meals/calculation/values, range latest allocations, and bounded intake/value rows.
- Meal and allocation SQL both require `meal_plan_entries.status='planned'` and the validated 31-day-or-shorter range. There are no per-meal calls or profile-wide allocation reads.
- Allocation SQL selects the latest revision per series before application semantics. Planned/served count in planned nutrients; skipped is capacity-free; eaten/leftover retain occupied historical capacity without counting as planned.
- Meal calculation rows use the same presentation domain for current/stale/unavailable status and warnings. Nutrient scaling uses every joined value, not the compact-card subset.
- Intake SQL selects latest eaten/corrected series in a bounded timezone envelope. Exact profile-local dates are calculated server-side, so a moved/corrected/deleted newer revision cannot leave an older value in the range.
- Planned and confirmed totals are separate result fields. No allocation becomes confirmed intake.
- Access uses `view_diary` and preserves the prior Nutrition intake forbidden error. Other profiles contribute anonymous capacity only; their profile/principal IDs and diary details never enter the return value.
- `showMealPlanNutrition=false` hides the day and meal metric previews only. Total/assigned/unassigned/overallocated values, allocation forms, calculation quality, prepared-batch controls, empty/status states, and not-eaten language remain.
- Tests prove five queries, 200 irrelevant historical rows, Los Angeles midnight filtering, skipped meal exclusion, fractional/all-nutrient scaling, privacy, stale state, and preview-off rendering. Full 225-unit/129-integration suites, typecheck, lint, and build pass.

The concurrent duplicate migration number remains a separate ownership issue and was not changed. The exact Judge timed out and was interrupted; this PM fallback applied the same read-only gate.
