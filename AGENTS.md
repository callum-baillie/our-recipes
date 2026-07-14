# Repository guidance

- Keep browser code out of SQLite, filesystem, backup, and provider credentials.
- Treat household profiles as a convenience feature, never as access control.
- Preserve the signed `ActorContext` seam when adding recipe audit/history behavior.
- Validate all HTTP input and preserve exact trusted-origin checks on mutations.
- Do not make a live OpenAI call without a credential gate and explicit paid-call permission; use deterministic mocks in tests.
- Extend Drizzle migrations rather than changing applied migration SQL.
- Do not claim Docker, PWA, backup, or Unraid completion without direct evidence.
