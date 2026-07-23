# T074 prepared alignment delivery

New prepared batches now freeze one immutable, server-resolved recipe calculation. Creation requires explicit confirmation that the cooked batch matches the selected calculation, verifies the current recipe revision, and rejects a final cooked weight that differs from the calculation before any row is inserted. The stored preparation evidence is derived from the calculation's source digest, notes, contributions, nutrition-record identities, edible/drained factors, optional inclusion, and final weight; the browser does not supply nutrient totals, provenance, or alignment truth.

Prepared consumption now accepts exactly one of serving count or portion weight. Weighed intake requires frozen final-weight evidence, scales nutrients from that immutable calculation, and stores the weighed basis in the intake snapshot. A derived serving equivalent is stored only for prepared-yield capacity accounting, so weighed and serving-based portions share the same over-allocation protection. Identical retries still return the same intake/allocation pair, while conflicting idempotency-key reuse remains atomic.

The meal-planning preparation form makes calculation alignment explicit and instructs the user to recalculate first when cooking details changed. The prepared workspace exposes serving or gram inputs only when final-weight evidence exists and keeps planning, preparation, serving, leftovers, and consumption distinct.

Verification passed: 4 focused unit tests, 9 focused integration tests, 179 full unit tests, 107 full integration tests, Prettier, ESLint, TypeScript, and scoped diff checks.

The exact GoalBuddy Worker exceeded the single 30-second wait and was interrupted. The PM completed the same bounded allowed-file package as permitted fallback.
