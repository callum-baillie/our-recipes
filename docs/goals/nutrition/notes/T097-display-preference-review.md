# T097 display-preference review

Decision: approved with one scope narrowing.

The existing profile row and optimistic full-profile PATCH are the correct current-setting seam. It already enforces signed Nutrition identity, strict trusted origin, `manage_profile`, full Zod validation and an exact expected version. Additive columns with deterministic defaults preserve existing profiles; no browser storage or separate unaudited API is needed.

Approve three preferences that have immediate truthful behavior:

1. `visibleNutrientCodes`: one to twelve unique canonical codes, defaulting to `fiber`, `calcium`, `iron`, `potassium`, `vitamin_d`, `sodium`, `added_sugars`, and `saturated_fat`. It filters goal-backed coverage rows only; a selected nutrient without a current goal remains absent and the existing explicit empty state remains truthful.
2. `trendRangeDays`: exactly 7, 14 or 30, default 7. It drives the existing timezone-aware diary summary and all trend title/date/table copy. Missing days remain `null`; insight calculations may use that selected recent window, while recommendation service behavior is unchanged.
3. `showPlannedNutrition`: boolean, default true. It controls only planned-value presentation in the Overview calorie metric/chart/table; it does not delete projections, alter meal planning, or change confirmed goal status.

Do not add `macroTrendMode` yet because no macro-trend control exists; persisting a switch that cannot affect the product is misleading. Likewise defer card/planner flags until those routes establish an explicit authorized Nutrition-profile selection and can apply them in the same vertical.

The Settings form must explain these are display choices, not changes to diary, plan or goals. Accessible profile summaries may expose these non-sensitive choices so authorized diary viewers see the profile owner's selected presentation. Private profile mapping must return the visible list as an array; persistence remains validated JSON text.

The exact Worker may touch only migration `0024`, the journal, schema, profile domain/service, Settings/page/dashboard/chart files and focused profile/service/view/component/chart tests. It must prove migration defaults, canonical/deduplicated bounds, optimistic conflict and denial, full request round-trip, selected coverage, 7/14/30 missing-day rendering, planned suppression without data mutation, scoped formatting/diff, fresh disposable migration/database check, full gates and build. Historical goal selection, bounded aggregate/source queries, measurements, macro mode, card/planner surfaces, household and Pantry remain out of scope.
