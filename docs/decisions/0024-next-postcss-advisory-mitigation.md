# 0024 — temporary Next.js PostCSS advisory mitigation

## Context

The pinned stable `next@16.2.10` declares `postcss@8.4.31`, which is affected
by `GHSA-qx2v-qp2m-jg93` (patched in PostCSS `>=8.5.10`). A fresh
`pnpm audit --prod` reported this as one moderate production advisory. The
current stable Next release remains pinned to the affected child dependency, so
an ordinary Next upgrade cannot resolve it without moving to a prerelease.

## Decision

Keep Next, Node, pnpm, and the application code unchanged. Add the exact pnpm
child override `next>postcss: 8.5.17` in `pnpm-workspace.yaml`, then refresh
and freeze `pnpm-lock.yaml`. PostCSS 8.5.17 is the current patched MIT release
and remains compatible with the Node 24 runtime.

This override is deliberately narrow. It neither suppresses the audit nor
changes an unrelated dependency. After a frozen installation, the lockfile
contains only `postcss@8.5.17`, `node_modules/next/node_modules/postcss` is not
present, and the production audit returns zero advisories. `pnpm why postcss`
may still show Next's original declared `8.4.31` range; the resolved tree and
audit result are the authoritative proof of the override.

## Consequences

Run `pnpm audit --prod --audit-level=moderate` in release maintenance. Revisit
and remove the override when a stable Next release ships a patched child
dependency and the frozen install/audit/build gates prove the ordinary
resolution safe.

## Evidence

- [PostCSS advisory GHSA-qx2v-qp2m-jg93](https://github.com/advisories/GHSA-qx2v-qp2m-jg93)
- [Next.js issue documenting the affected child and targeted override](https://github.com/vercel/next.js/issues/93604)
- Local verification on 2026-07-13: frozen install, clean production audit,
  `pnpm verify`, browser acceptance/accessibility/release-quality, local OCR
  smoke, database check, and diff check all pass.
