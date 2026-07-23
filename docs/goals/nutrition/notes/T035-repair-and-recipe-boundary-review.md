# T035 repair and recipe boundary review

## Decision: approved

The T034 repair satisfies the rejected gate. Active-profile insights now receive and evaluate `coverageByNutrient`, so one well-documented nutrient cannot authorize a suggestion for another nutrient with inadequate coverage. The page's recent-coverage matching and household observed-day counts both use the same validated profile-local Nutrition date key, including each compared profile's own `dailyResetTimezone`. Mixed-completeness and near-midnight regressions pass alongside the full repository gates recorded by T034.

Privacy and communication boundaries remain intact: hidden profiles are excluded, household comparison still requires an authorized relationship or explicit permission, normalized values use each person's own active goals, and low-quality data is suppressed with calm non-clinical copy.

The largest safe next step is a read-only recipe boundary Scout, not an implementation package yet. Recipe ingredients are free-form quantity/unit/item rows, recipes store servings as text, food records have several incompatible basis types plus optional serving-weight, density, and piece-weight evidence, and immutable recipe calculations/intake snapshots already exist. Pantry's current T015 owns schema, product-mapping, cooking, planning, and shared integration files. The Scout must identify the exact stable seams and conversion rules before a Worker can calculate or log recipe nutrition without silently inventing density, treating cooking as eating, or colliding with Pantry.

The following review boundary is mandatory for the eventual Worker: deterministic source/calculation identity; supported same-family unit conversion only; explicit evidence for cross-family, per-serving, and per-unit scaling; serving/yield ambiguity surfaced rather than guessed; missing, optional, substitution, edible/drained, retention, confidence, and completeness evidence preserved per contribution; append-only calculation revisions; and explicit user-confirmed recipe intake frozen from a server-selected calculation. Planning and cooking must never create intake implicitly.

The exact GoalBuddy Judge exceeded the single-wait limit. The PM performed the same read-only gate as permitted fallback.
