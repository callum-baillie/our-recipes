# T081 deterministic recommendation boundary Judge

Decision: `approved`.

The T080 formula keeps target/minimum/range gaps distinct from limits, preserves nutrient-specific diary/planner quality thresholds, uses one immutable latest-current recipe calculation, and exposes coverage as an explanation rather than an opaque score. Lexicographic ordering is auditable. Pantry state remains availability, explicit allocations remain planned intake, and only confirmed immutable diary rows remain consumed.

The Worker must use exact normalized allergy and exclusion evidence only. Any allergy plus unresolved included-product evidence suppresses the candidate. Missing dietary tags are unknown, not compatible. One-serving limit checks must exclude a candidate when it would exceed a current applicable configured limit. No diagnostic, treatment, regulated-content or moral claim is allowed.

Feedback is bound to a deterministic evidence key and is private to the signed profile. Grocery mutation requires an explicit user-selected list and one exact shortage confirmation; rendering, dismissal or “helpful” feedback must never add an item or mutate Pantry. The additive schema/migration and Nutrition-owned files are disjoint from Pantry T038.

The exact GoalBuddy Judge exceeded the single 30-second wait and was interrupted. The PM performed the same read-only gate as permitted fallback.
