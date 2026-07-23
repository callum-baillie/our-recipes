# T061 diary lifecycle Judge

Decision: `repair_required`.

The append-only command ledger, latest-revision rules, server-owned frozen snapshots, transactional copy/day/move/restore/reassign behavior, source-and-target authorization, replay reauthorization, trusted-origin mutation route, accessible controls, secret omission, export permission and response headers are supported by focused tests plus the full 174-unit/96-integration oracle and fresh migration evidence.

Two export details must be repaired before approval:

1. `diaryCommandHistory` currently retains `targetProfileId` and parses the full `resultSnapshot`. An export of a source profile can therefore reveal another private profile UUID and target revision IDs after cross-profile copy/reassignment. Export only selected-profile-owned command metadata and replace any non-self target with a semantic redacted marker; do not export cross-profile result IDs, request digests or retry keys.
2. The 50,000-row cap is evaluated after arrays have already been loaded. Add a selected-profile preflight count cap before materializing export rows, and avoid one unbounded `IN (...)` parameter list while retaining the final 32 MiB serialized-byte cap.

The exact GoalBuddy Judge exceeded the single 30-second wait and was interrupted. The PM performed the same read-only gate as permitted fallback.
