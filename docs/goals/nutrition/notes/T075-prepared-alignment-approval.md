# T075 prepared alignment Judge

Decision: `approved`.

Prepared creation validates the current recipe revision and exact final-weight match before insertion, then freezes the selected calculation's server-owned source digest, notes, contribution identities, edible/drained factors, optional inclusion and final weight. The browser supplies only an explicit acknowledgement and the calculation identity; it cannot supply nutrient totals, provenance, source digests, or alignment state. New instances are always aligned or rejected, while legacy blocked instances remain immutable.

Consumption validation requires exactly one serving-count or weighed-portion input. A weighed portion requires matching frozen final-weight evidence, scales the immutable calculation by grams/final weight, and persists grams as the intake basis. The derived serving equivalent is used only for prepared-yield capacity and is the sole capacity amount, so it cannot double count the original gram basis. Transactional intake, allocation and idempotency-command insertion roll back together, and retries preserve the exact result pair.

The focused and full gates passed with direct mismatch, weighed scaling, capacity, exactly-one-basis, partial-serving, seconds, replay, privacy and historical-name tests. The next largest safe slice is recipe-library and planner integration, but its exact boundary needs a read-only map because private Nutrition sessions are distinct from household profile selection and the concurrent Pantry T038 Worker owns adjacent planner-demand files.

The exact GoalBuddy Judge exceeded the single 30-second wait and was interrupted. The PM performed the same read-only gate as permitted fallback.
