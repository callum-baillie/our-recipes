# T037 recipe slice approval

## Decision: approved

T036 identifies a coherent schema-safe vertical slice. Existing normalized tables already support immutable food records, calculation revisions, ingredient contributions, nutrient totals, and intake snapshots. The package can remain wholly outside Pantry T017 ownership and can expose unsupported evidence as missing rather than widening conversion behavior.

The Worker must deliver a production path, not only seeded tests: an authenticated manual product-record form/API, deterministic calculation of a current recipe revision, normalized totals/per-serving quality review, and explicit recipe consumption for an authorized Nutrition profile. Only the server may choose food records, calculate nutrient values, assemble source/calculation provenance, and scale the immutable calculation into intake values. Browser input is limited to validated source-label fields, optional-ingredient inclusion, recipe/calculation selection, portion, meal slot, and timestamp.

Required evidence includes: same-family and density-backed conversions; rejected cross-family/custom/package guesses; strict ambiguous-yield handling; missing mapping/quantity/record/nutrient quality; optional exclusion; source-priority and explicit supersession; deterministic digest/idempotency; reliable supplied energy preference plus marked macro fallback; calculation history preservation across recipe or food-record changes; exact trusted-origin and signed Nutrition session gates; profile `manage_profile` authorization for intake; a malicious browser payload unable to inject nutrient/provenance data; and visible copy separating raw-ingredient estimates, calculation quality, planned/cooked food, and confirmed intake.

Rendered browser/build proof is not part of this Worker while the existing shared `.next` owner remains active. Recipe-card/list, selected-serving and weight presentation outside Nutrition, automatic recalculation triggers, cooked-instance substitutions/yield, planner previews, and Pantry/grocery recommendations remain later integration packages.

The exact GoalBuddy Judge exceeded the single-wait limit. The PM performed the same read-only approval gate as permitted fallback.
