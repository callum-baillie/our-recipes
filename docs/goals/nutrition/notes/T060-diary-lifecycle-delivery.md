# T060 private diary lifecycle delivery

- Added an append-only, principal-scoped idempotency ledger for copy-entry, copy-day, move, restore, and cross-profile reassign commands.
- All copied or restored nutrient values, provenance, quality fields, source references, and portion basis are rebuilt from frozen server-owned intake revisions inside one SQLite transaction.
- Move and restore append corrected revisions with required reasons. Reassign atomically creates the target series and appends a source deletion revision after authorizing both profiles.
- Added accessible Food Diary controls with stable retry keys and a deterministic, row/byte-bounded private JSON export. Export omits credentials and audit principal identifiers and returns private no-store, no-cache, nosniff attachment headers.
- Verification: 174 unit tests and 96 integration tests passed; lint, typecheck, focused Prettier and diff checks passed; a fresh database migrated through 0022 and directly exposed `nutrition_diary_commands`.

The exact GoalBuddy Worker exceeded the single 30-second wait and was interrupted. The PM completed the same bounded allowed-file package.
