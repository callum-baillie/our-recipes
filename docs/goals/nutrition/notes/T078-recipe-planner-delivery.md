# T078 recipe library and primary planner delivery

The recipe library now validates factual Nutrition facets for maximum calories, minimum protein, minimum fiber, maximum sodium, minimum completeness and a selected supported nutrient. Nutrition sorts cover calories, protein, fiber, sodium and completeness with neutral metric-and-direction labels. Every condition and sort uses a correlated value from the single latest calculation for the recipe's current revision before SQL count, limit and offset; missing or stale values do not become zero or fall back to an older same-revision calculation.

Users can select one or more compact card facts from calories, protein, carbohydrate, fat, fiber and sodium. Repeated URL values are bounded, unique and preserved through quick/advanced forms and pagination. Cards show only the chosen available per-serving facts, their units and calculation coverage; missing selected facts are labeled unknown and stale calculations remain hidden.

The primary `/planner` page now resolves the signed private Nutrition cookie on the server, enumerates only diary-visible profiles authorized to that principal, and reuses the tested Nutrition projection/allocation/status/prepared workflow for the selected week. Without a valid session it performs no private query and shows only an unlock link. Household “who's eating?” selection is explicitly labeled as serving-headcount estimation; it never creates equal Nutrition allocations. Unassigned servings remain explicit and preparation still does not imply consumption.

Verification passed: 9 focused unit tests, 14 focused integration tests, the existing 10,000-recipe performance budget, 180 full unit tests, 108 full integration tests, Prettier, ESLint, TypeScript and scoped diff checks.

The exact GoalBuddy Worker exceeded the single 30-second wait and was interrupted. The PM completed the same bounded allowed-file package as permitted fallback.
