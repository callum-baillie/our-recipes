# T068 preparation-aware calculation map

## Current evidence

- `recipe_nutrition_calculations.final_weight_grams` and contribution-level `edible_portion`, `drained_yield`, `retention_factors` already exist, but the ordinary calculator always writes null/1/1/empty.
- The current request accepts only included optional ingredient IDs. Required ingredients cannot be excluded; substitutions and explicit preparation factors cannot be selected.
- Mapped Pantry products already support immutable per-100g, per-100ml, per-serving and per-unit records plus density/piece/serving-weight evidence. Selecting a different stored product record can therefore represent a direct cooked-food record without inventing nutrition values.
- Calculation totals, immutable contribution records, energy supplied-first/macro-fallback behavior, completeness/confidence and digest deduplication are implemented. Per-serving output is derived only when recipe serving text is unambiguous.
- Final weight is not used to derive per-100g or serving-weight views. Recipe Food Diary intake accepts serving count only and cannot use a weighed portion.
- Prepared instances accept actual servings/final weight/free-text adjustment kinds. Any adjustment blocks consumption, but there is no matching recalculation workflow; a changed final weight alone is incorrectly considered aligned when adjustments are empty.
- The Nutrition workspace sends an empty optional list and exposes no ingredient-specific preparation controls. Planner currently sends null final weight/empty adjustments.
- Pantry T037 owns only shopping-list editor, meal-plan Pantry demand and its tests/E2E; the Nutrition calculation/prepared files are conflict-free.

## Safe food-science rules

- Never change nutrient values from free-text descriptions.
- Resolve exclusions, substitutions and direct cooked choices to server-owned recipe ingredients, Pantry products and immutable food-record revisions.
- Apply edible/drained/yield factors only when explicitly entered with bounded values and an evidence note; mark the result estimated and retain factors in the contribution/digest.
- Apply nutrient-specific retention only from an existing cited `reference`, `provider`, or `laboratory` Nutrition source and snapshot its source/version in calculation notes/digest. An absent factor means no speculative loss calculation, not 0% retention.
- Final cooked weight changes concentration/per-100g and weighed-portion scaling, not total nutrient mass unless explicit sourced retention/drain/edible factors also apply.

## Sequential Worker packages

1. **Calculation and weighed-portion core (first):** extend the strict calculation request with final weight, explicit excluded IDs, substitution product IDs and bounded per-ingredient edible/drained factors with evidence notes; resolve every identity and nutrition record server-side; append a new calculation version/digest; derive total/per-serving/per-100g/portion summaries; accept exactly one serving-count or portion-weight basis for recipe intake; expose accessible workspace controls and tests. No migration is needed.
2. **Prepared alignment:** validate final weight and adjustment identity against a matching calculation, make mismatches require recalculation, allow the planned/prepared UI to select the recalculated snapshot, and consume weighed prepared portions without mutating historical instances.
3. **Optional sourced retention module:** only if suitable cited sources exist locally, accept nutrient-specific factors tied to existing reference/provider/laboratory sources, version the calculation evidence, and add tests. Otherwise retain the explicit no-speculation warning and document the extension point rather than fabricating factors.

Stop if a browser supplies nutrient totals/source snapshots, a substitution lacks a current immutable food record, an adjustment references another recipe, total nutrients change from final weight alone, unsupported conversions are guessed, retention lacks eligible cited evidence, historical calculations/intake are mutated, or Pantry T037-owned files are required.

The exact GoalBuddy Scout exceeded the single 30-second wait and was interrupted. The PM completed the same read-only map as permitted fallback.
