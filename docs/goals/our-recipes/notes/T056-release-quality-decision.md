# T056 — Release-quality next-package audit

## Result: not complete

T055 completes the bounded document scan-set gap: one PDF or one-to-four
JPEG/PNG/WebP scans are now review-first, normalized locally, retained as
ordered opaque artifacts with hashes, and backed by fresh unit, integration,
browser, accessibility, build, and frozen-install evidence. The earlier
Windows `EPERM` rename in an unrelated backup integration test passed on the
single focused retry, so it is recorded as transient rather than a product
blocker.

## Current acceptance evidence

| Original area | Evidence | Status |
| --- | --- | --- |
| Household setup, profiles, shared recipes, revisions, images, search, cooking, planning, shopping, printing, backups, PWA, API | T004–T055 receipts and current passing automated suites | Implemented; a single final release-flow proof is still needed. |
| Safe review-first capture and portability | URL JSON-LD/Microdata capture, PDF, ordered image scan sets, pasted JSON-LD, manual review/confirmation tests | Implemented for the supported formats. |
| Responsive, light/dark, print, and realistic library scale | Focused responsive/axe checks and print CSS exist, but no current cross-surface or 10,000-recipe acceptance matrix | Safe local gap; select T057. |
| OpenAI provider behavior | No SDK/provider boundary, key, or mock contract exists | Operator/credential-gated; do not implement a callable path without the required credential decision. |
| OCR, HEIC/HEIF, and archive intake | T053 compatibility/threat map; no accepted decoder/model/archive boundary | Separately high-risk and intentionally unavailable. |
| Docker/Unraid deployment proof | Artifacts and daemon-run script exist; `docker info --format '{{.ServerVersion}}'` on 2026-07-13 fails because `dockerDesktopLinuxEngine` is absent | Environment-gated; no build, health, mounted-volume, or Unraid claim is valid. |

## Selected package: T057

T057 should add a bounded local release-quality matrix. It must prove the
existing end-to-end household experience at desktop, tablet, and mobile
viewports; system light and dark color schemes; and US Letter/A4 print media.
It must also seed and query a 10,000-recipe SQLite fixture to establish an
explicit non-flaky local performance budget for the paginated library/search
path. The Worker may add a system-driven dark token treatment and responsive or
print fixes when the checks reveal a defect, but must not change business
semantics or invent a benchmark claim that the tests do not measure.

This is the largest remaining unblocked package that closes original release
criteria without credentials, remote processing, new dependencies, a Docker
daemon, or destructive data work.

## Deferred and operator-gated work

- OpenAI SDK/provider work needs the required safe credential check and an
  explicit user decision about a usable key before a callable configuration or
  live test; paid calls need separate approval.
- Docker/Unraid health and mounted-volume persistence need a running Docker
  daemon and an operator-capable host.
- HEIC/HEIF, bundled handwriting OCR, and archive intake need distinct
  maintained-runtime, licensing, resource-bound, and hostile-fixture decisions
  before any implementation.
