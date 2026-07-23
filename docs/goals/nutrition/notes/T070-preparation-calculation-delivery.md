# T070 preparation-aware calculation delivery

- Calculation requests now strictly accept final cooked weight, explicit included/excluded recipe ingredient IDs, ingredient-to-Pantry-product substitutions, and bounded edible/drained factors with required evidence notes. Conflicts, duplicates and foreign ingredient IDs are rejected.
- All nutrient values and substitution records are resolved server-side from immutable food-record revisions. Contribution rows retain base multiplier, edible portion, drained yield and selected record; source digest/notes retain substitutions, exclusions, factor evidence and the explicit no-retention policy.
- Calculator version 2 records the new preparation policy. Final weight changes only per-100g concentration and serving weight; it never changes total nutrient mass.
- Calculation summaries now expose total, per-serving and per-100g values. Recipe intake accepts exactly one serving count or weighed portion; weighed intake requires final-weight evidence and freezes `recipe_weight` provenance.
- The accessible workspace exposes ingredient-specific include/exclude, substitution, edible/drained evidence, final weight, serving/weighed intake controls, and plainly states that cooking loss/retention is not guessed.
- Verification: 178 unit tests and 103 integration tests passed; focused tests, lint, typecheck, formatting and diff checks passed.

The exact GoalBuddy Worker exceeded the single 30-second wait and was interrupted. The PM completed the same bounded allowed-file package.
