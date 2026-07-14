# T079 — release-oracle audit after provider, HEIC/HEIF, and Docker recovery

Date: 2026-07-13  
Decision: **not complete yet; one documentation-only release-record package
remains.**

## Audit result

T078 resolves the three technical gaps identified by the prior external-gate
audit: the official OpenAI provider is now a server-only, explicit,
deterministically tested feature; browser-side HEIC/HEIF conversion is proven
with real fixtures before the unchanged server byte gate; and a Docker Engine
29.6.1 smoke run proves image build, health, first-run setup, and persistence
across recreation of a temporary bind mount. The diagnostic also fixed the
standalone image's missing `drizzle-orm` migration dependency.

The source and test evidence now supports the original product behavior, but
the current release-facing documents still say those capabilities are deferred
or that a real Unraid host proof is a release prerequisite. That is stale:
the supplied requirements call for an Unraid template/configuration review and
a local Docker build/health/persistence check, not mutation of an operator's
Unraid host. The user authorized and received the latter. The specification
also requires deterministic OpenAI mocks for automated testing and separately
requires permission for a paid live request; a paid call is therefore not a
missing acceptance test.

## Acceptance evidence map

| Release criterion group | Current evidence | Result |
| --- | --- | --- |
| Fresh household, profiles, shared recipes, attribution, per-profile state | Existing first-run and local acceptance browser/integration flows; T007–T076 receipts | Proven |
| Structured recipes, search, lifecycle, revisions, tags, collections, images | Domain/service/unit/integration/browser coverage; fresh release-quality flow | Proven |
| URL, text, JSON-LD, PDF/scan, photo, and HEIC/HEIF review-first import | Deterministic parser/boundary tests; T078's real HEIC and HEIF Chromium fixtures; explicit review UI | Proven |
| AI text/URL normalization and vision review | Server-only official SDK, strict structured schema, confirmation/origin/profile checks, deterministic provider doubles | Proven without a paid call |
| AI generated image | Explicit confirmed server action, local processing/storage, content-free audit, deterministic provider test | Proven without a paid call |
| Cooking, scaling/conversion, planning, shopping, print, PWA, API | Prior services and fresh release-quality/a11y/browser proof | Proven |
| Backup, restore, migration, safety boundaries | Existing isolated backup/restore and migration checks; documented data boundaries | Proven |
| Docker and Unraid packaging | Non-root standalone image, health/migration entrypoint, compose/template/docs, T078 Docker Engine 29.6.1 build/health/setup/persistence proof | Proven; no Unraid host was modified |
| Quality, accessibility, visual, performance, dependency health | T078: frozen install; `pnpm verify`; 33 unit/22 integration; e2e; axe; release-quality; OCR smoke; DB check; production audit; diff check | Proven, with documented non-blocking OpenAPI and Turbopack warnings |
| Secret and paid-call boundary | Development-only ignored key fallback, Docker exclusion, server-only marker, no key output; no paid request made | Proven |

## Exact remaining task

T080 must update only release-facing status/checklist/product-requirement
wording to reflect this evidence, preserving two important distinctions:

1. Docker's temporary bind-mount proof is not an assertion that an operator's
   actual Unraid host was changed.
2. Deterministic provider coverage is complete, while a paid live OpenAI call
   remains opt-in and unrun.

After that small documentation package and a fresh final Judge audit, no safe
local implementation work remains.
