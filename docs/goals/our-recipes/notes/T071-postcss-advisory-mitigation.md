# T071 — PostCSS advisory mitigation

## Result

Resolved `GHSA-qx2v-qp2m-jg93` without changing the selected stack. The
workspace now applies the exact pnpm child override
`next>postcss: 8.5.17`; the frozen lockfile resolves PostCSS 8.5.17 and the
installed Next tree has no nested `next/node_modules/postcss` package.

`pnpm audit --prod --audit-level=moderate --json` now reports zero advisories.
`pnpm why postcss` continues to display Next's manifest declaration of 8.4.31,
but that is not the installed resolution; the lockfile, filesystem check, and
audit prove the override is active.

## Verification

- `pnpm install --frozen-lockfile` — pass
- `pnpm audit --prod --audit-level=moderate --json` — pass, zero advisories
- `pnpm why postcss` — pass; declaration/reporting behavior recorded above
- installed-tree `require.resolve('next/node_modules/postcss/package.json')`
  absence check — pass
- `pnpm verify` — pass (30 unit, 19 integration, formatting/lint/types/OpenAPI/build)
- `pnpm test:e2e` — pass
- `pnpm test:a11y` — pass
- `pnpm test:release-quality` — pass
- `pnpm test:ocr:smoke` — pass
- `pnpm db:check` — pass
- `git diff --check` — pass

The known seven OpenAPI documentation warnings and the existing Turbopack
backup-route trace warning remain unchanged and non-blocking.
