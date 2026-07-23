# T007 additive integrity repair

The five rejected integrity invariants are repaired through additive Pantry migration 0017 and matching service/domain changes. Pantry migration 0015 remains untouched. Concurrent nutrition work claimed migration 0016, so Pantry was renumbered without changing nutrition history.

The migration adds deterministic per-batch event sequence, exact-versus-approximate measurement triggers, validation of existing batch rows, and active-stock product archive protection. Service snapshots now include product/source links; undo uses batch sequence and restores the complete mutable state. FEFO uses effective printed/opened expiry and checks every optimistic update before recording events.

Focused Pantry tests (7 unit, 8 integration), full tests (124 unit, 38 integration), formatting, lint, TypeScript, diff checks, and a fresh disposable migration pass. Production build was not started because another user-owned task has a live Next dev process writing the same `.next` directory. This environmental gate remains for final verification.
