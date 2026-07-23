# T091 adult energy estimate audit

## Decision: approved

T090 matches the eight NASEM 2023 Table 5-16 adult equations and the published age/height/weight units. Completed age is evaluated at the user-selected effective date, the output preserves its unrounded result and applies an explicitly disclosed nearest-whole-kcal rule, and the versioned note pins source ID, DOI, profile version, formula inputs, category, date and rounding.

Every body/reference fact comes from the server-authorized private profile. The request can supply only action, expected version, effective date, exact fresh PAL category and apply concurrency identifiers. The service independently requires `manage_profile` and `manage_goals`, consent/enablement, complete inputs, age 19+, and absence of pregnancy/breastfeeding. It does not interpret the generic profile activity value. The UI exposes the USDA category descriptions and classification uncertainty, identifies weight-maintenance scope and avoids individual-precision, diagnosis or loss/gain claims.

Preview does not mutate. Apply creates or explicitly supersedes through the existing immutable goal series. A current calorie goal cannot be replaced until its exact latest version is selected. Exact operation replay is restricted to the same profile/principal/request evidence and now also verifies the persisted nutrient, unit, source type, target kind and rounded value; different reuse conflicts. Focused checks passed after that audit hardening, and T090's full 190-unit/114-integration/lint/type/build evidence remains applicable.

Known boundaries remain explicit: children, pregnancy and breastfeeding are unsupported; PAL selection is uncertain; the estimate is for weight maintenance; numeric micronutrient DRIs have not been added. These are truthful scope limits, not inferred success.

The next exact task is a read-only individual-chart Scout covering all ten brief datasets, existing helpers/data availability, profile display-preference persistence, missing-day/completeness semantics, planned-versus-consumed/source/weight inputs, accessible table alternatives, responsive design and query/performance boundaries. It should select the smallest useful first chart Worker rather than build a wall of charts.

The exact GoalBuddy Judge exceeded the single 30-second wait and was interrupted. The PM performed the same read-only audit as permitted fallback.
