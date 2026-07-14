# T003: Technical due diligence

Task: `T003`
Kind: `scout`
Status: `current`

## Summary

The prescribed technical foundation is viable for a production local-first application. Use Node 24 LTS rather than the current Node 26 line, which is not yet LTS. Next.js App Router supports the requested TypeScript/Tailwind baseline and standalone output. Drizzle supports both `better-sqlite3` and `node:sqlite`; prefer a stable production driver after the foundation Judge weighs native-build reliability against `node:sqlite`’s release-candidate status. Serwist, Sharp, Vitest, Playwright/axe, Zod, shadcn, and Docker’s multi-stage guidance all fit the required architecture with explicit verification points.

## Confirmed guidance

### Runtime, framework, and package management

- Node’s official release schedule lists **Node 24 (Krypton)** as LTS; production applications should use an Active or Maintenance LTS release. Node 26 is still Current.
- Next.js App Router’s current installation guide requires Node 20.9+ and its recommended setup enables TypeScript, Tailwind, ESLint, and App Router. Node 24 therefore meets both framework and Sharp requirements.
- pnpm remains an actively maintained package manager and Sharp documents cross-platform support for pnpm 8+; pin the exact `packageManager` field and lockfile during the foundation package.
- shadcn’s current Next.js guidance supports a Next project initialized first, then selective component addition. It should remain an accessible foundation rather than dictate product styling.
- Zod 4 is stable and supports type inference with boundary validation; use it as the shared API/request/response and AI-candidate contract source.

### SQLite and persistence

- Drizzle officially supports `better-sqlite3` and `node:sqlite` as synchronous SQLite choices.
- Node’s built-in `node:sqlite` API provides synchronous `DatabaseSync`, foreign-key options, timeout support, and backup support, but its module is currently labeled **release candidate** in current Node documentation.
- `better-sqlite3` is the safer default for the stated production requirement if current Node 24 compatibility and Linux image builds are verified at install time. Keep the repository interface isolated so a future move to the built-in driver or PostgreSQL does not leak into services.
- Whichever driver is selected, the foundation must establish WAL, foreign keys, busy timeout, transactional writes, migration locking, clean startup/shutdown, and backup-before-nontrivial-migration behavior.

### PWA, images, and Docker

- `@serwist/next` documents an App Router integration, manifest, worker, and precache flow. Its general getting-started flow is webpack-oriented and calls out a separate Turbopack path, so the selected Next bundler must be tested rather than assumed.
- Sharp supports Node 20.9+ and has Linux prebuilt binaries. Its documentation distinguishes glibc and musl targets, reinforcing the specification’s Debian-slim default and the need to test the intended Unraid architectures.
- Next’s `output: "standalone"` produces a lean deployable server but requires explicitly copying public/static assets into the runtime image. Its tracing configuration can include native assets such as Sharp when needed.
- Docker and Next.js documentation support multi-stage builds, production-only runtime artifacts, correct ownership, and a non-root runner. Verify the actual runtime with a mounted `/data` volume rather than trusting a build-only result.

### Testing and AI provider boundary

- Vitest supports a dedicated configuration and a non-watch `vitest run` command suitable for deterministic unit and integration gates.
- Playwright supports browser projects and `@axe-core/playwright`; its accessibility guide explicitly says automated checks must be complemented by manual assessment, matching the visual/accessibility oracle.
- OpenAI’s official JavaScript quickstart uses the server-side SDK and Responses API for text/vision requests. OpenAI’s key-safety guidance requires a backend-held environment variable and forbids browser/mobile key exposure. The current model catalog identifies GPT Image 2 for image generation; it is a separate image-generation concern and does not supply structured outputs, so recipe-candidate extraction should use a structured-output-capable vision/text model selected through configuration.
- The OpenAI developer-docs MCP was added globally during this task. It is unavailable until a Codex restart, so this receipt uses the official developer/help documentation fallback. No credential was inspected and no provider call was made.

## Decisions required from T004

1. Select exact stable package versions from current registry metadata and commit the lockfile; do not take versions from this note as fixed.
2. Confirm Node 24 LTS with `better-sqlite3` on the selected Debian-slim architectures; if it is not supported cleanly, record a deliberate driver decision rather than silently switching to release-candidate `node:sqlite`.
3. Choose and test the Serwist integration compatible with the selected Next bundler; cache only the requested shell, recent read-only recipes, and bounded local images.
4. Use Next standalone output with explicit static/public and native asset inclusion; run the final image as non-root under a writable mounted `DATA_DIR`.
5. Implement OpenAI behind `AiProvider`, with server-only configuration, bounded retries/timeouts, deterministic mocks, opt-in live tests, and no default key requirement for the non-AI product.

## Official sources consulted

- Node LTS schedule: <https://nodejs.org/en/about/previous-releases>
- Next.js installation, App Router, standalone output, and deployment: <https://nextjs.org/docs/app/getting-started/installation>, <https://nextjs.org/docs/app>, <https://nextjs.org/docs/app/api-reference/config/next-config-js/output>, <https://nextjs.org/docs/app/getting-started/deploying>
- Drizzle SQLite drivers: <https://orm.drizzle.team/docs/sqlite/get-started-sqlite>
- Node SQLite: <https://nodejs.org/api/sqlite.html>
- Serwist Next.js integration: <https://serwist.pages.dev/docs/next/getting-started>
- Sharp installation: <https://sharp.pixelplumbing.com/install/>
- Docker multi-stage and Next.js production guidance: <https://docs.docker.com/build/building/multi-stage/>, <https://docs.docker.com/guides/nextjs/>
- shadcn Next.js setup: <https://ui.shadcn.com/docs/installation/next>
- Zod basics: <https://zod.dev/basics>
- Vitest: <https://vitest.dev/guide/index.html>
- Playwright testing and accessibility: <https://playwright.dev/docs/running-tests>, <https://playwright.dev/docs/next/accessibility-testing>
- OpenAI JavaScript quickstart, model catalog, image model, and API-key safety: <https://platform.openai.com/docs/quickstart/make-your-first-api-request>, <https://developers.openai.com/api/docs/models>, <https://developers.openai.com/api/docs/models/gpt-image-2>, <https://help.openai.com/en/articles/5112595-best-practices-for-api-key-safety>

## Board Receipt Snippet

```yaml
receipt:
  result: done
  note: notes/T003-technical-due-diligence.md
  summary: "Current official guidance supports the requested stack; T004 must lock exact versions and resolve SQLite/PWA/Docker integration details before writes."
```
