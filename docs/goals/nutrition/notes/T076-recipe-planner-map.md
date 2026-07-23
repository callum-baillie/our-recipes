# T076 recipe library and planner map

## Evidence

- `recipeLibraryQuerySchema`, `listRecipeLibrary`, `RecipeLibraryFilters`, `/recipes`, and `RecipeSummaryCard` form one query-to-card path. `listRecipeLibrary` builds SQL conditions and sort expressions before count/limit/offset, so nutrition filters and sorts must be correlated SQL expressions against the latest calculation for the current recipe revision. Filtering rendered cards after pagination would produce false totals and short pages.
- Current cards receive a fixed calories/protein/fiber/sodium projection from `getRecipeNutritionPresentation`. No schema change is needed for user-selected compact fields: a bounded URL query selection can be validated, preserved by both filter forms, and mapped to a neutral server-owned array of per-serving facts. Stale/unavailable calculations must remain excluded and missing values remain unknown.
- Safe initial library semantics are factual per-serving bounds and sorts: maximum calories, minimum protein, minimum fiber, maximum sodium, minimum completeness, and support for a selected nutrient. Sort labels must state the metric and direction. No opaque health score or regulated claim is needed.
- Personalized remaining-target ranking requires signed access to current goals and diary totals and belongs with the deterministic recommendation slice, where allergies, exclusions, sufficient-data thresholds and dismissal evidence are joined. It must not be smuggled into the household recipe query or inferred from an active household profile.
- `/planner` currently has only household profile selection, which affects estimated meal servings and is not Nutrition authorization. `NutritionPage` proves the correct seam: resolve the signed `NUTRITION_ACCESS_COOKIE`, enumerate only profiles authorized to that principal, and call `getNutritionMealProjection(profileId, principalId, range)`. Without a valid session the planner may show only a neutral unlock link.
- `NutritionMealPlanning` already provides explicit fractional own allocations, hidden aggregate assignment, unassigned/overallocated servings, per-person current-calculation preview, status controls and prepared-batch creation. Reusing it on the primary planner after signed server authorization provides the bounded adapter without duplicating calculation logic. Planner copy must explain that household headcount estimates servings and never allocates Nutrition portions equally.
- Direct library tests live in `recipe-schema.test.ts`, `household-service.test.ts`, `recipe-performance.test.ts`, and normalized component tests. Private uneven planner authorization is covered by `nutrition-meal-planning-service.test.ts`; a new server/component regression should cover valid/absent sessions and no hidden profile data.
- Pantry T038 owns `src/components/pantry-manager*`, `src/lib/domain/pantry.ts`, `src/lib/services/pantry-service.ts`, its batch-action route, Pantry tests/E2E and shared docs. It does not own the library, planner page, meal planner, Nutrition planner component, or recipe query files below. Do not touch `meal-plan-pantry-demand.tsx` or Pantry-owned docs.

## Largest safe Worker package

Implement generic normalized nutrition library filters/sorts and configurable compact card facts before pagination, then add the signed private Nutrition allocation/projection panel to the primary planner. Preserve existing household planner behavior and make the headcount-versus-allocation distinction explicit.

Allowed files:

- `src/lib/domain/recipe.ts`
- `src/lib/services/recipe-service.ts`
- `src/app/recipes/page.tsx`
- `src/components/recipe-library-filters.tsx`
- `src/components/recipe-summary-card.tsx`
- `src/app/planner/page.tsx`
- `src/components/meal-planner.tsx`
- `src/components/meal-planner.module.css`
- `src/components/nutrition-meal-planning.tsx`
- `src/components/nutrition-meal-planning.module.css`
- one new planner-only Nutrition access/panel component and CSS if needed
- `tests/unit/recipe-schema.test.ts`
- `tests/unit/nutrition-recipe-components.test.ts`
- `tests/integration/household-service.test.ts`
- `tests/integration/recipe-performance.test.ts`
- `tests/integration/nutrition-meal-planning-service.test.ts`
- one new focused planner-page/component test if needed

Verify focused schema/query/pagination/component/private-planner tests, 10,000-recipe performance, full tests, lint, typecheck, scoped formatting and diff integrity. Stop for schema/migration changes, post-pagination filtering, broad household private-data reads, equal automatic allocation, opaque scoring/claims, Pantry T038 overlap, browser-owned nutrient data, or out-of-scope failures.

Parallel safety is false for write work because the primary planner and shared recipe query are broad user-facing seams in a dirty worktree, even though this file list is disjoint from Pantry T038.

The exact GoalBuddy Scout exceeded the single 30-second wait and was interrupted. The PM completed the same read-only map as permitted fallback.
