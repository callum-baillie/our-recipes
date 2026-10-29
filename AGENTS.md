# Repository guidance

- Keep browser code out of SQLite, filesystem, backup, and provider credentials.
- Treat household profiles as a convenience feature, never as access control.
- Preserve the signed `ActorContext` seam when adding recipe audit/history behavior.
- Validate all HTTP input and preserve exact trusted-origin checks on mutations.
- Do not make a live OpenAI call without a credential gate and explicit paid-call permission; use deterministic mocks in tests.
- Extend Drizzle migrations rather than changing applied migration SQL.
- Do not claim Docker, PWA, backup, or Unraid completion without direct evidence.

<!-- BEGIN:nextjs-agent-rules -->

## This is NOT the Next.js you know

This version has breaking changes — APIs, conventions, and file structure may all differ from your training data. Read the relevant guide in `node_modules/next/dist/docs/` (resolved from this file's directory; in monorepos the `next` package may not be visible from the repo root) before writing any code. Heed deprecation notices.

This block is written and re-added by `next dev` — verify at `node_modules/next/dist/server/lib/generate-agent-files.js`. Removing it from a diff only re-creates the uncommitted change; committing it with your work keeps the tree clean.

<!-- END:nextjs-agent-rules -->
