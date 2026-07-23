# T079 recipe library and primary planner Judge

Decision: `approved`.

Nutrition filters, support checks and sorts are correlated to the one latest calculation for the current recipe revision and participate in SQL conditions, count, ordering, limit and offset. Comparisons exclude nulls, null sort values remain last, completeness is a proportion exposed as a percentage, and a regression proves an older same-revision nutrient does not leak through when the latest calculation lacks it. The 10,000-recipe default path remains within its existing local performance budget.

Compact card field selections are validated, bounded, unique, URL-preserved and limited to factual per-serving nutrients with units and coverage. Stale calculations remain hidden, unavailable values are not converted to zero, and no score, moral label or regulated claim was introduced.

The primary planner resolves a signed Nutrition session before listing accessible profiles or calling private diary/projection services. It shows only diary-visible profiles, disables mutations without manage rights, retains aggregate-only hidden allocations, and reuses the tested explicit fractional allocation/prepared workflow. Household headcount is explicitly an estimated serving count and never creates equal allocations or consumption. Pantry T038 files were untouched.

The next safe phase is a read-only map of deterministic recommendation joins across current goals/diary quality, recipe calculations, meal projections, Pantry availability/expiry and grocery confirmation/dismissal seams while Pantry T038 continues.

The exact GoalBuddy Judge exceeded the single 30-second wait and was interrupted. The PM performed the same read-only gate as permitted fallback.
