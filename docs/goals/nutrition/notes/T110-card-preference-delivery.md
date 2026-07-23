# T110 — surface preferences and recipe-library delivery

## Outcome

Delivered additive profile-owned display preferences and replaced the recipe library's per-card Nutrition reads with one batch query.

## Persistence and validation

- Migration 0026 adds `show_recipe_card_nutrition` and `show_meal_plan_nutrition` with true defaults, plus `recipe_card_nutrient_codes` defaulting to energy/protein/fiber.
- The full profile schema accepts one to five unique compact codes from energy, protein, carbohydrate, total fat, fiber, and sodium.
- Create/update persistence, safe accessible summaries, private settings, optimistic PATCH, and the settings UI round-trip all three fields.
- Invalid empty, duplicate, unsupported, and six-field lists are rejected.

## Signed profile and cards

- `/recipes` keeps household ActorContext only for existing recipe preferences.
- It separately resolves the signed Nutrition cookie, lists that principal's accessible Nutrition profiles, and chooses a requested ID only from that list. Unauthorized IDs fall back to the first accessible profile.
- Persisted visibility and compact-field defaults apply to the chosen profile. Validated URL fields remain temporary view overrides. Without a Nutrition identity, neutral generic defaults remain available without personalized language.
- Card output remains factual per-serving values plus calculation coverage. Missing/stale/unavailable evidence is never shown as zero or current.
- Home and upcoming compact-card variants were not changed.

## Bounded presentation

- `listRecipeNutritionPresentations()` validates/deduplicates IDs and uses one joined query for each recipe's latest calculation, source, algorithm, and values.
- The existing presentation domain still owns current/stale/unavailable semantics, warnings, serving division, quality, and allowed values.
- Carbohydrate and total fat were added to the concise presentation whitelist, repairing the previous mismatch with library field choices.
- A 101-recipe regression proves one prepared statement and mixed stale/unavailable results.

## Verification

- Focused profile/schema/presentation/component/service suite: 51 tests passed.
- Full suite: 223 unit and 125 integration tests passed.
- Typecheck, lint, scoped formatting, fresh in-memory migrations, and production build passed.
- The production build retained only the pre-existing backup-service NFT trace warning.

## Remaining

Planner preview visibility and bounded projection remain a separately reviewed slice. Household analysis/charts, documentation, and rendered final evidence remain later.
