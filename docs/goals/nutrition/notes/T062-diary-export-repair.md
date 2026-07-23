# T062 private export repair

- Added selected-profile count preflight before export arrays are materialized. The bound conservatively includes the maximum possible prepared-link rows.
- Replaced the potentially large nutrient-value `IN` query with a profile-scoped join and chunked prepared-instance ID reads to 250 parameters.
- Command history now exports only its selected-profile-owned command ID/type/time and `self`, `redacted`, or null target semantics. It omits target/source profile IDs, result revision IDs, idempotency keys, request digests and principal IDs.
- Tests prove a cross-profile command cannot leak its target UUID, target revision ID or retry key and that 50,001 selected-profile measurements are rejected at preflight.
- Verification: 174 unit tests and 97 integration tests passed; focused tests, lint, typecheck, formatting and diff checks passed.

The exact GoalBuddy Worker exceeded the single 30-second wait and was interrupted. The PM completed the same bounded allowed-file repair.
