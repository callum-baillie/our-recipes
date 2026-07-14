# T004: Foundation-package decision

Task: `T004`
Kind: `judge`
Status: `current`

## Decision

Approve one coherent **runnable production base plus functional first-run setup** package. It must establish the execution spine that every later recipe feature relies on: pinned current dependencies; clear UI/API/service/repository boundaries; persistent SQLite configuration and profiles; secure active-profile handling; a working accessible setup flow; baseline tests; honest living documentation; and a visual specification before the recipe-library UI is built. This is deliberately more than a scaffold but stops before recipe CRUD, imports, PWA caching, image processing, AI calls, meal planning, backup/restore, and Docker runtime validation, which need later domain-specific packages and stronger proof.

## Architecture decisions

- **Runtime:** Node 24 LTS. The available local Node 24.17.0 and current stable packages meet the documented Next.js and Sharp minimum of Node 20.9.
- **Framework:** Next.js 16.2.10, React 19.2.7, strict TypeScript, Tailwind 4.3.2, and shadcn/Radix used selectively as an accessible primitive layer. The visual specification and generated concept must precede main recipe UI work.
- **Persistence:** Drizzle 0.45.2 with `better-sqlite3` 12.11.1. Current registry metadata explicitly supports Node 24. Keep a repository interface so this can later change; do not use `node:sqlite` while its official status remains release candidate.
- **Validation/testing:** Zod 4.4.3 contracts; React Hook Form 7.81.0 for complex setup forms; Vitest 4.1.10; Playwright 1.61.1 plus axe 4.12.1. The package must implement actual tests, not only configuration.
- **Security seam:** configuration Zod schema, secure defaults, strict headers/CSP compatible with the initial app, signed active-profile cookie, origin checking for mutations, `ActorContext`, request validation, no public remote-access claim, and no OpenAI credential or invocation.
- **API seam:** versioned `/api/v1` health/setup/profile endpoints backed by services and repositories, with a maintained baseline OpenAPI document.
- **Deployment decision:** Docker/Unraid artifacts are deferred to a later operations package because the current environment has no available Docker daemon; the final goal still requires real build, health, persistence, and restore evidence.

## Worker package

Create the current Next.js project from the empty repository and implement a polished, responsive, keyboard-accessible first-run onboarding that persists household configuration and at least one profile in SQLite, creates and switches the signed active profile, and exposes a healthy versioned API. Include a complete visual specification and Image Gen concept before building recipe-library UI; foundational docs must state implementation status truthfully. Pin and lock the compatible dependencies above, establish migration/test/format/lint/typecheck/build/OpenAPI gates, and keep later product domains explicitly pending.

## Required proof

- Dependency install is reproducible through `pnpm install --frozen-lockfile`.
- Unit and integration tests prove configuration, profile creation/switching, persistence, cookie signing, API validation, and origin rejection.
- Playwright and axe prove the first-run setup works with two profiles and has no automatically detectable baseline accessibility violations.
- Formatting, linting, strict type checking, OpenAPI validation, and production build pass.
- The package has no OpenAI key lookup, paid API request, Docker build claim, recipe placeholder masquerading as completed behavior, or external publication.

## Deferred risks

- A Docker daemon is unavailable locally, so container files and persistence proof must be handled by a later Worker when verifiable.
- Serwist needs a bundler-specific integration and must be tested only once recipe caching behavior exists.
- If `better-sqlite3` fails against the locked Node 24 environment, stop and return to Judge review; do not silently adopt release-candidate `node:sqlite`.
- OpenAI developer-docs MCP is configured globally but needs a Codex restart before it can be used; its official web documentation is sufficient for this package because no provider code will call the API.

## Board Receipt Snippet

```yaml
receipt:
  result: done
  decision: approved
  full_outcome_complete: false
  note: notes/T004-foundation-decision.md
  summary: "Approved a runnable foundation plus first-run/profile vertical slice with pinned current dependencies and no Docker or live-AI claims."
```
