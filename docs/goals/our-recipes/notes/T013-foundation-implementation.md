# T013 — foundation implementation receipt

## Delivered

- pnpm 11.12 now installs through the documented project-level `hoisted` linker and `copy` import mode. The explicit `allowBuilds` map permits only the four locked native/runtime packages needed by this graph. A clean frozen install and `require('better-sqlite3')`/`require('playwright-core')` load succeeded.
- The project now contains a runnable Next 16/React 19 application with a Drizzle SQLite migration, WAL-enabled server-only database service, one-time household setup, profile records, and a signed HttpOnly active-profile cookie behind an `ActorContext` seam.
- Versioned health, setup, and profile APIs validate Zod input and reject untrusted mutation origins. No CORS policy is enabled and the UI visibly says profiles are not security.
- The design concept was translated into a responsive, warm kitchen-notebook setup and household home, with no fake recipe data or inert primary button. Desktop visual inspection was performed on both first-run and established-home flows.
- Architecture, API/OpenAPI, data model, security, test strategy, product scope, visual specification, decision record, CI workflow, release checklist, and status documentation are present.

## Compatibility correction

Initial registry-current pins TypeScript 7.0.2 and ESLint 10.7.0 did not work with the current Next 16 lint stack. TypeScript 5.9.3 and ESLint 9.39.5 were selected after focused diagnostics; they meet Next's TypeScript 5.1+ requirement and `eslint-config-next` 16.2.10 peer range. `pnpm peers check` is clean.

## Verification

All of the following passed on the final locked dependency graph:

- `pnpm install --frozen-lockfile`
- `pnpm format:check`
- `pnpm lint`
- `pnpm typecheck`
- `pnpm test:unit` (4 tests)
- `pnpm test:integration` (SQLite persistence test)
- `pnpm test:e2e` (Chromium first-run workflow)
- `pnpm test:a11y` (axe first-run scan)
- `pnpm openapi:validate` (valid document; Redocly emits three non-blocking metadata recommendations)
- `pnpm build` (production Turbopack build)
- `git diff --check`

## Deliberate remaining work

This is a verified foundation, not the claimed full release. Recipe-domain CRUD and revisions, capture/import, images, AI boundary, cooking, planning/lists, PWA, backup/restore, Docker/Unraid, and final release evidence remain queued. Docker cannot be verified here because no Docker daemon is available; no live OpenAI credential or paid request was used.
