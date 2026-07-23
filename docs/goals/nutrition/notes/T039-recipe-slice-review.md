# T039 recipe slice review

## Decision: rejected

T038's new path passes its calculation, history, authorization, dedicated-route injection, full test, lint, type, formatting, and communication evidence. The conservative conversion policy is explicit; ambiguous serving text disables per-serving intake; source and calculation identities are versioned; identical inputs are idempotent; corrections append; old consumed values remain frozen; and the UI does not count planned, cooked, or Pantry food as eaten.

The generic-route bypass is confirmed. A syntactically valid recipe intake payload containing an attacker-chosen 1 kcal value, confidence 1, completeness 1, and `estimated: false` is accepted by `nutritionIntakeRevisionInputSchema`. `POST /api/v1/nutrition/profiles/{profileId}/intake` passes that entire parsed object directly to `appendNutritionIntakeRevision`. The service verifies recipe ID, calculation ID, calculation version, source digest, and source ID, but never recomputes or compares nutrient values, quality, portion scaling, or the rest of the provenance snapshot. A browser that copies the real calculation identity can therefore persist false recipe totals through the older endpoint.

Repair narrowly: the generic HTTP route may continue to support explicit manual entries and non-consumed skipped/deleted history, but must reject browser-built consumed/corrected recipe or product snapshots and direct callers must not be able to change a correction series from recipe/product to manual to evade that policy. The dedicated recipe route remains the only current HTTP path for confirmed recipe consumption. Add a real-calculation API regression that submits copied identity with attacker totals and receives a safe 400 response, plus a service regression for source-type continuity. Do not weaken the direct server service, immutable correction history, or future server-built product/manual integrations.

The exact GoalBuddy Judge exceeded the single-wait limit. The PM performed the same read-only audit and executed the schema-level attack proof as permitted fallback.
