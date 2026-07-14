# T078 — OpenAI, HEIC/HEIF, and Docker delivery evidence

Date: 2026-07-13

## Delivered

- Added a server-only official OpenAI SDK provider. It uses Responses Structured
  Outputs for bounded text and normalized-scan review suggestions, plus explicit
  server-side generated serving images.
- Added all-required provider JSON-schema output validation followed by existing
  recipe normalization. Every operation is explicit, trusted-origin/profile
  protected, process-rate-limited, review-first, and recorded in
  `ai_operation_audits` without raw source, provider URLs, or secrets.
- Reused the existing local key only through the development-only loader. It was
  not read, displayed, logged, or sent. Production reads `OPENAI_API_KEY` only
  from runtime environment; `.api_keys` is ignored and excluded from Docker.
- Added browser-only `@discourse/heic` conversion. Import and recipe-photo flows
  turn HEIC/HEIF into in-memory JPEG before `FormData`; the server still rejects
  raw HEIC/HEIF bytes. Chromium converted real small HEIC and HEIF fixtures from
  libheif's codec corpus and completed the ordinary review import path.
- Updated API, security, data-model, deployment, testing, dependency-recovery,
  and developer-workflow documentation.

## Docker diagnosis and resolution

The first smoke run built the image but timed out waiting for health. A fresh
temporary diagnostic container showed the exact startup failure:

`ERR_MODULE_NOT_FOUND: Cannot find package 'drizzle-orm' imported from /app/scripts/container-migrate.mjs`.

The standalone image omitted the migration entrypoint's direct ORM dependency.
The Dockerfile now copies `drizzle-orm` alongside the already traced runtime
modules (and the optional `openai` runtime dependency). A rerun passed image
build, health, first-run setup, and persistence across a temporary bind-mounted
container recreation. A separate temporary no-key container also returned only
the expected safe `unconfigured` AI status.

## Verification

- `pnpm install --frozen-lockfile`
- `pnpm verify` — 33 unit and 22 integration tests, format, lint, typecheck,
  OpenAPI validation (8 pre-existing/non-blocking documentation warnings), and
  production build passed. The known backup-route Turbopack tracing warning
  remains non-blocking.
- `pnpm test:e2e` — 3 Chromium workflows passed, including HEIC/HEIF conversion.
- `pnpm test:a11y` — 2 workflows passed.
- `pnpm test:release-quality` and `pnpm test:ocr:smoke` passed.
- `pnpm db:check`, `pnpm audit --prod --audit-level=moderate`, and
  `git diff --check` passed.
- `pnpm test:docker` passed on Docker Engine 29.6.1.

## Boundary retained

No paid/live OpenAI request was made. A live request, if future release evidence
requires one, still needs its own explicit operator approval. No Unraid host,
registry, remote infrastructure, or existing household data was changed.
