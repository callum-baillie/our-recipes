# T040 generic intake repair

Closed the confirmed client-snapshot bypass without changing schemas or the dedicated recipe path.

- The generic HTTP intake route now calls a user-entered policy seam. Consumed/corrected recipe and product payloads are rejected with a 400 response and must use a server-built integration route. Explicit manual intake and skipped/deleted history remain available.
- The underlying append-only service now requires every correction/deletion series to preserve its original source type. A copied recipe calculation cannot be relabeled as manual to evade the HTTP rule.
- A focused API regression creates a real persisted record/calculation, copies all valid source/version/digest identity, supplies attacker-chosen 1 kcal and perfect quality, and proves the generic route rejects it. The dedicated recipe route continues to produce the server-scaled immutable snapshot.
- Focused service/API tests pass: 6 tests. Full tests pass: 161 unit and 77 integration. Focused lint, formatting, scoped diff, and full typecheck pass.

The checkout-wide lint rerun is currently blocked by concurrent Pantry T019 code in `src/components/shopping-list-editor.tsx` (`react-hooks/refs` at line 131). That file is outside this task and actively owned by Pantry, so it was preserved. This is an external verification limit, not a Nutrition repair failure; rerun the full lint gate after Pantry T019 settles.

The exact GoalBuddy Worker exceeded the single-wait limit. The PM completed the exact allowed-file repair as permitted fallback.
