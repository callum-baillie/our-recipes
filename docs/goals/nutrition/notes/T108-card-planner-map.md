# T108 — recipe-card/list and planner Nutrition map

## Current state

### Recipe library

- `/recipes` already validates six compact field choices and provides factual per-serving filters/sorts for calories, protein, fiber, sodium, supported nutrient, and calculation completeness.
- Non-compact library cards render the selected facts and coverage only for a current normalized recipe calculation. Missing values are omitted and coverage is explicit; no score, goal claim, or moral label is generated.
- The route currently calls `getRecipeNutritionPresentation()` once per rendered recipe. That creates an avoidable page-size N+1 query pattern.
- Compact fields are only URL state. The Nutrition profile does not persist “show Nutrition on recipe cards” or compact card fields.
- The route uses household `ActorContext.profileId` only for established recipe reactions/favorites. It does not resolve a signed Nutrition identity or an authorized Nutrition profile for display preferences. Those identities must remain separate.
- Home and upcoming-meal cards intentionally do not receive `normalizedNutrition`. The compact upcoming card also omits collection actions. Keeping these variants simpler satisfies the “do not overload every card” direction; the full recipe library is the concise list integration.

### Meal planner

- `/planner` already resolves the signed Nutrition cookie, lists only profiles accessible to that principal with diary visibility, validates the requested `nutritionProfile` by membership in that safe list, and reauthorizes in the projection/allocation services.
- Household planner headcount remains separate and explicitly says it grants no private Nutrition access. It estimates total servings only; it does not create equal per-person allocations.
- `NutritionMealPlanning` shows explicit fractional allocations, assigned/unassigned/overallocated totals, planned and confirmed values separately, current calculation completeness/confidence, and prepared-batch actions that do not imply eating.
- The profile setting “whether meal-plan nutrition previews are shown” does not exist. Hiding previews must not hide allocation or prepared-batch controls.
- `getNutritionMealProjection()` loads all allocation revisions for the selected profile before date filtering, then performs per-meal presentation and calculation reads. This is fixed in row count only for the meal query, not in total data/query count, and is the main remaining planner performance defect.

### Profile settings

- Migration 0024 persists visible dashboard nutrients, trend range, and planned-chart visibility.
- No persisted card visibility, compact card nutrient list, or planner-preview flag exists.
- The full optimistic profile PATCH is the correct mutation seam: additive columns must be added through a new migration, schema/domain defaults, `profileValues`, safe/current projections, settings form, and existing optimistic tests.

## Required split

### Slice A — display preferences and bounded recipe-library projection

Add additive profile fields with safe defaults:

- `show_recipe_card_nutrition` boolean, default true.
- `recipe_card_nutrient_codes` JSON text, validated unique list of one to five values from energy, protein, carbohydrate, total fat, fiber, and sodium; default energy/protein/fiber.
- `show_meal_plan_nutrition` boolean, default true.

Expose only these presentation preferences through `AccessibleNutritionProfile`; do not expose targets, allergies, body values, diary data, or the private profile row. Extend private settings and the optimistic PATCH.

On `/recipes`, independently resolve the signed Nutrition session and select `nutritionProfile` only from `listAccessibleNutritionProfiles`. Keep household ActorContext solely for existing recipe preferences. Use the selected authorized profile defaults, allow validated URL field overrides, and provide a scoped profile selector. With no Nutrition session/profile, retain neutral generic defaults so recipe Nutrition remains usable without implying personalization.

Add a batch recipe-presentation service that loads current-revision latest calculations and requested nutrient values for the page's recipe IDs in a fixed number of queries. The card renderer continues to receive server-projected facts and never calculates nutrients or target matches in the browser.

Recommended Worker files:

- `drizzle/0026_nutrition_surface_preferences.sql`
- `drizzle/meta/_journal.json`
- `src/lib/db/schema.ts`
- `src/lib/domain/nutrition-profile.ts`
- `src/lib/services/nutrition-profile-service.ts`
- `src/lib/services/nutrition-recipe-calculation-service.ts`
- `src/app/nutrition/page.tsx`
- `src/app/recipes/page.tsx`
- `src/components/recipe-library-filters.tsx`
- `src/components/nutrition-dashboard.tsx`
- `src/components/nutrition-profile-settings.tsx`
- focused profile, presentation, recipe-query/card component and integration tests

Stop if the library requires private targets/diary/allergies, household profile identity is used as Nutrition authorization, compact/home variants must change, or current Pantry files are needed.

### Slice B — planner preview flag and bounded projection

After Slice A is audited, pass the selected authorized profile's `showMealPlanNutrition` into the planner component. Conditionally hide calorie/macro and per-meal nutrient previews only; retain explicit serving allocation, unassigned counts, calculation quality needed for prepared evidence, and all planned-versus-consumed semantics.

Refactor the projection service to fetch only meal IDs in the validated range, latest relevant own/all allocation revisions, latest current-recipe calculations, and nutrient values in fixed batch queries. Preserve current statuses, skipped/leftover semantics, immutable calculation IDs, and exact access checks. Add a large meal/history regression and query-count assertion.

Recommended Worker files:

- `src/app/planner/page.tsx`
- `src/components/nutrition-meal-planning.tsx`
- `src/components/nutrition-meal-planning.module.css`
- `src/lib/services/nutrition-meal-planning-service.ts`
- focused component and service tests

Do not edit `meal-planner`, planning persistence, Pantry demand/availability, schema/migrations, allocations, consumption, or cooking APIs in this slice.

## Risks and test oracle

- A `nutritionProfile` query value is input, never authorization. Both routes must select it from the signed principal's accessible list and services must reauthorize.
- Generic recipe nutrients may be shown without diary access, but configured goals, remaining targets, gaps, allergies, and exclusions require separately reviewed authorized projections and are not part of these slices.
- Card and planner browser code must format server values only.
- Missing calculation/value remains unavailable, never zero.
- Planned values remain separate from confirmed intake.
- Test migration defaults and round-trip, invalid/duplicate field lists, unauthorized profile selection fallback, on/off behavior, batch query counts, stale/missing calculations, explicit fractional allocations, skipped/leftover exclusion, and accessibility at narrow width.

The active Pantry T068 package owns only Pantry date normalization, availability service, and focused tests, so these proposed files do not overlap it. Recheck ownership immediately before each Worker.
