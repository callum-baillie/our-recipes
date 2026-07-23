# T109 — card preference and bounded library review

## Decision: approved with one incorporated repair

T108's Slice A is coherent and does not overlap active Pantry T068, provided the Worker includes the existing compact-presentation whitelist defect: `recipeLibraryQuerySchema` offers carbohydrate and total fat, but `presentRecipeNutrition()` currently retains only energy, protein, fiber, and sodium. The Worker must add carbohydrate and total fat so every allowed compact field can render.

## Approved design

- Add migration 0026 with boolean defaults true for card Nutrition and planner Nutrition previews, plus a JSON-text one-to-five compact code list defaulting to energy/protein/fiber.
- Validate the compact codes as a unique subset of energy, protein, carbohydrate, total fat, fiber, and sodium in the Nutrition profile schema. Use the same limit in recipe query overrides.
- Round-trip all three fields through create/update, safe accessible summary, private profile settings, optimistic PATCH, and settings UI. They are presentation preferences; no goals, allergies, measurements, or diary rows may join this projection.
- `/recipes` may continue to use household ActorContext only for established recipe reactions/favorites. It must separately resolve the signed Nutrition cookie and select the requested Nutrition profile only from that principal's accessible list.
- With an accessible profile, apply its persisted defaults and visibility flag; validated URL compact-field choices are temporary display overrides. With no Nutrition identity, retain neutral generic defaults and make no personalized claim.
- Add a fixed-query batch presentation function for all rendered recipe IDs. It must select each recipe's latest calculation, preserve current/stale/unavailable semantics, batch nutrient values, and return the same domain presentation shape. No per-recipe service calls are permitted in the route.
- Keep home, upcoming-meal compact, and other card variants unchanged. The full recipe library remains the deliberately concise list integration.
- Keep planner component/service changes out of this Worker. Only persist and expose its future preview flag.

## Worker boundary

Allowed implementation files:

- `drizzle/0026_nutrition_surface_preferences.sql`
- `drizzle/meta/_journal.json`
- `src/lib/db/schema.ts`
- `src/lib/domain/nutrition-profile.ts`
- `src/lib/domain/recipe.ts`
- `src/lib/domain/nutrition-recipe-presentation.ts`
- `src/lib/services/nutrition-profile-service.ts`
- `src/lib/services/nutrition-recipe-calculation-service.ts`
- `src/app/nutrition/page.tsx`
- `src/app/recipes/page.tsx`
- `src/components/recipe-library-filters.tsx`
- `src/components/nutrition-dashboard.tsx`
- `src/components/nutrition-profile-settings.tsx`
- focused profile, recipe schema/presentation, component, and integration tests

Verification must prove migration defaults/round-trip, duplicate/empty/>5/unsupported rejection, signed authorized profile selection/fallback, visibility on/off, all six fields, missing-not-zero/stale state, fixed query count with a large page fixture, compact variant preservation, full tests/lint/typecheck/build, and scoped formatting/diff.

Stop if targets, diary, allergies, measurements, household-profile authorization, client calculation, planner rendering/projection, Pantry files, regulated/moral/opaque claims, or an N+1 path is required.

The exact Judge timed out under the single-wait rule and was interrupted; this PM fallback applied the same read-only gate.
