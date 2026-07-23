# T025 intake history and privacy review

## Decision: approved

T024 is approved as the persistence boundary for explicit meal allocation and confirmed Nutrition diary history.

The migration uses additive tables and foreign keys, positive/range checks, unique `(series_id, revision)` constraints, and restricted historical references. The service exposes inserts and authorized reads only; no update/delete path exists. It rejects stale predecessors, cross-profile predecessors, cross-profile intake/allocation links, corrections without a predecessor, and non-latest supersession. Tests prove the first snapshot remains byte-for-byte unchanged after a correction.

Consumed nutrient rows exist only for explicit `eaten` or `corrected` diary revisions. Planned, served, skipped, leftover, cooked, and Pantry states never invoke the diary append operation. An `eaten` allocation must link an already-existing current consumed intake series for the same private Nutrition profile.

Consumed revisions retain recipe calculation or food-record identity, source IDs, frozen source name/provider/version details, calculation version and digest, portion basis, confidence, completeness, estimated state, and sparse per-nutrient source snapshots. The service checks this evidence against the immutable normalized source record at write time; later preferred-source changes cannot alter history.

Every read uses fixed `view_diary` authorization and every write uses fixed `manage_profile` authorization against the private Nutrition principal/permission model. Household profile switching is absent from this boundary. Diary-only viewers can read but cannot write; guardian writes are explicit grants.

## Next boundary

Persistence services accept a principal ID, but no HTTP session currently proves that ID or rechecks signed-session `accessVersion`. The next safe slice is therefore authenticated Nutrition onboarding/session and complete private profile/diary APIs before any browser UI consumes these services. It must use the existing trusted-origin helper on every mutation, HttpOnly signed cookies, current-principal/access-version resolution, fixed server authorization, managed dependent/guest/unassigned profile creation, and denial/error tests. Concurrent Pantry owns shared API documentation, so this slice must defer OpenAPI reconciliation.

## Harness note

The exact GoalBuddy Judge exceeded the single-wait limit without returning. The PM performed the same read-only gate as permitted fallback.
