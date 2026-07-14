# 0021 — Local release-quality acceptance matrix

- Status: accepted
- Date: 2026-07-13

## Context

The household workflow already had focused browser and accessibility coverage,
responsive breakpoints, and recipe print CSS. It did not have a repeatable
release-level check for the original desktop/tablet/mobile, light/dark,
US Letter/A4, and realistic-library-scale requirements.

## Decision

- Respect `prefers-color-scheme` with system-driven design tokens. This does
  not add a profile, account, or persisted theme setting. The dark token set
  keeps the cookbook’s editorial hierarchy while ensuring labels, fields, and
  primary actions have automated axe contrast coverage.
- `pnpm test:release-quality` drives the real local setup → recipe creation →
  library flow at 1440px, 768px, and 390px, asserts no root horizontal
  overflow, captures local desktop/mobile/dark evidence, and rejects browser
  console errors.
- The same flow renders the real recipe detail as both US Letter and A4 PDFs
  under print media. Print CSS intentionally returns to black on white paper
  and uses a 12mm page margin for both formats.
- The integration half seeds an isolated SQLite database with 10,000 recipe
  rows and FTS entries, then measures the actual `listRecipeLibrary` search,
  count, pagination, ordering, and profile-decoration path. A 1.5-second
  budget protects this development environment from regressions; it is not a
  universal production latency promise.

## Consequences

The matrix adds no dependency, network request, provider use, Docker process,
or production data mutation. It complements—not replaces—daemon-backed
Docker/Unraid proof, cross-browser/device lab testing, or an operator’s final
deployment acceptance. Temporary screenshot and PDF artifacts remain under
Playwright test output rather than the repository.
