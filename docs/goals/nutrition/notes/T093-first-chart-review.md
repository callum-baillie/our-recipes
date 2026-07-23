# T093 first individual-chart review

## Decision: approved

The package is approved with these exact formulas and ambiguity rules:

- Calorie progress receives confirmed energy as `null` when absent and planned energy as a separate `null`/amount. It must not add planned to confirmed for goal status because current data cannot prove that a planned meal was not already recorded as eaten. For exactly one current active energy target/minimum, confirmed remaining is `boundary - confirmed`; negative values are labeled above. A range retains both minimum and maximum; a limit retains only its maximum semantics. Multiple current energy goal rows produce an explicit ambiguous-goal state, not a selected guess.
- Macro composition calls the existing pure `macroEnergyDistribution` on confirmed totals. Protein, carbohydrate and total fat must all be present; otherwise the chart is incomplete. Alcohol may be absent and then contributes zero. Each segment carries grams, kcal and percentage of calculated macro energy; it is not presented as percentage of supplied label calories.
- Nutrient coverage emits one row per current active goal version. Target/minimum uses `amount / value`; range preserves minimum/maximum and classifies below/within/above; limit uses `amount / maximum` and labels remaining/above. Missing nutrient amounts remain no-data. Bar widths may be visually capped, but exact uncapped amounts/ratios and semantics remain in text/table.

The page computes datasets on the server and passes them to a dedicated component. Overview may show the calorie and macro panels; Nutrients may show semantic coverage. Each needs a title, concise factual takeaway, units, date/person scope, non-color status text, table equivalent and empty/incomplete state. CSS must stack/scroll safely on narrow viewports. No schema, service/API, longer-range, measurement, preference, Pantry/planner/recommendation or client calculation is permitted.

Allowed files are exactly T092's six-file package. Required tests cover null/ambiguity, all goal semantics, capped-versus-exact values, macro missing/optional-alcohol behavior, planned separation and rendered headings/tables/status text. Full tests, lint, typecheck, formatting, diff and build remain required.

The exact GoalBuddy Judge exceeded the single 30-second wait and was interrupted. The PM performed the same read-only review as permitted fallback.
