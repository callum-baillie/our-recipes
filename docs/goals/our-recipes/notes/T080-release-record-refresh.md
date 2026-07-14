# T080 — release-facing record refresh

Date: 2026-07-13

## Documentation corrected

- `RELEASE_CHECKLIST.md` now records the Docker Engine 29.6.1 build, health,
  first-run, and bind-mounted persistence proof; it records the Unraid template
  and configuration review without asserting that an operator's host changed.
- The checklist now treats real HEIC/HEIF browser conversion and configured
  OpenAI vision as the completed review-first import path. The local bundled
  OCR remains accurately described as a printed-text assist, not a claim of
  handwriting accuracy by that model.
- `IMPLEMENTATION_STATUS.md` and `docs/product-requirements.md` no longer list
  the resolved provider, HEIC/HEIF, Docker, or host-deployment distinctions as
  unfinished release work.

## Retained boundary

No paid live OpenAI request was made. Deterministic provider doubles are the
required automated evidence; a paid request remains an intentional opt-in
operator action. No key was read or exposed, and no Unraid host was modified.

## Verification

- `pnpm format:check`
- `pnpm typecheck`
- `pnpm test:unit` — 33 passed
- `pnpm test:integration` — 22 passed
- `pnpm test:e2e` — 3 passed
- `pnpm test:a11y` — 2 passed
- `pnpm test:release-quality` — passed
- `pnpm test:docker` — passed
- `git diff --check`
