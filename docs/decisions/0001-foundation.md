# ADR 0001: Node 24 + Next 16 + Drizzle SQLite foundation

## Status

Accepted for the initial production foundation.

## Decision

Use Node 24, pnpm 11.12, Next.js 16 App Router, React 19, strict TypeScript 5.9.3, ESLint 9.39.5, Tailwind 4, Drizzle ORM, and `better-sqlite3`. Keep all data access server-side. Use a signed non-auth active-profile cookie and versioned REST endpoints. TypeScript 7.0.2 was rejected after Next's pinned ESLint/`typescript-estree` stack crashed while loading it; 5.9.3 is the newest compatible stable line and still exceeds Next 16's TypeScript 5.1 minimum. ESLint 10 was likewise rejected because Next's current React plugin stack requires the ESLint 9 API; 9.39.5 satisfies `eslint-config-next` 16.2.10's declared peer range.

For this Windows development environment, pnpm uses `nodeLinker: hoisted` and `packageImportMethod: copy` in `pnpm-workspace.yaml`. This is a documented alternative to pnpm’s isolated symlink layout after repeated manifest-opening failures. Build scripts are permitted only for the exact locked native/runtime packages needed by the current dependency graph; arbitrary dependency scripts remain disallowed.

## Consequences

This permits a persistent setup slice now without treating Node’s release-candidate SQLite API or a profile switcher as production authentication. Docker/PWA/live-AI claims remain deferred until their own evidence exists.
