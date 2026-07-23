# T083 recommendation delivery audit

## Decision: approved

T082 is approved within its bounded recommendation scope. Recommendations are computed server-side only after the requester independently passes profile-management, diary-view and goal-management authorization. The evidence key includes the profile version, current intake revisions, current planned calculation identities, goal version and candidate calculation/Pantry evidence; feedback is append-only, exact-retry idempotent and rejects stale supersession.

Recurring recommendations require three observed days plus nutrient-specific completeness. Planned recommendations require an explicit non-empty plan whose relevant meals all have current, sufficiently complete/confident target and limit evidence. Candidates use current-revision calculations and are suppressed for low quality, missing limit facts, unresolved allergy evidence, exact allergen conflicts, incomplete exclusion evidence or exact exclusion conflicts. Ranking is explicit and deterministic; Pantry stock, plans and prepared food never enter consumed totals.

The UI states nutrient amount, gap coverage, calculation quality, Pantry state, expiring products, exact shortages and unknown availability. Feedback and dismissal call only the private feedback endpoint. Grocery creation is available only for an exact shortage after a user selects a list and submits the specific item; no render or feedback path mutates groceries, Pantry, plans, allocations or intake. Wording is factual and non-diagnostic, controls are labeled, and missing data remains visible or suppressive.

Fresh evidence comprises migration through `0023`, 9 focused unit/component tests, 2 focused service/API integration tests, 184 full unit tests, 110 full integration tests, ESLint, TypeScript, OpenAPI validation and a production build. Pantry T038-owned files were not edited. Repository-wide formatting has unrelated existing drift, while the complete T082 file set passes scoped formatting.

The next exact slice is a read-only map of remaining profile/settings, chart and household requirements against the implemented schema, services, APIs, dashboard, comparison logic and tests. It must explicitly include dietary-preference semantics, optional/sensitive field explanations, opt-ins, normalized household visibility, the required accessible chart datasets/table alternatives, performance boundaries, and Pantry T045 ownership before proposing bounded Workers.

The exact GoalBuddy Judge exceeded the single 30-second wait and was interrupted. The PM performed the same read-only audit as permitted fallback.
