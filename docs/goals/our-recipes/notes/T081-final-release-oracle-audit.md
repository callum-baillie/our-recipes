# T081 — final release-oracle audit

Date: 2026-07-13  
Decision: **complete** (`full_outcome_complete: true`).

## Result

The current workspace satisfies the supplied release outcome. It is a complete
local-first household recipe manager rather than a scaffold or partial MVP:
the documented Docker deployment initializes a new household, retains data
through recreation, and the receipt-backed test matrix exercises the required
functional, quality, security, accessibility, visual, and operational paths.

## Release acceptance map

| Acceptance area | Current evidence | Result |
| --- | --- | --- |
| Fresh deployment, two household profiles, shared library, attribution, and separate profile preferences/history | Fresh-household browser workflow plus profile/domain integration coverage | Complete |
| Manual structured recipes, images, source data, tags, revisions, search, scaling, conversion, cooking/timers, print | Domain/services, integration tests, release-quality visual/print matrix | Complete |
| URL, text, JSON-LD, PDF/scan, photo, and HEIC/HEIF import | Bounded parser/storage checks, explicit review screens, real HEIC and HEIF Chromium conversion fixtures | Complete |
| OpenAI normalization and vision candidate review | Server-only official SDK, strict structured schema, explicit confirmation, rate limit, content-free audit, deterministic provider doubles | Complete; paid call intentionally unrun |
| OpenAI recipe-image generation and local serving | Explicit confirmed action, configured image model, local normalized storage, deterministic integration evidence | Complete; paid call intentionally unrun |
| Planning, editable shopping, JSON-LD/Markdown/portable export, backup/restore, PWA and versioned API | Existing service/integration/browser coverage and documented operations | Complete |
| Docker image, health, migration, non-root runtime, persistence, and Unraid package | Docker Engine 29.6.1 build/health/first-run/bind-mount recreation pass; reviewed compose/template/docs | Complete |
| Security and secret boundary | Server-only key loader, ignored/excluded `.api_keys`, origin/input/storage/SSRF/archive defenses, no secret output | Complete |
| Quality gates and polish | Frozen install; format, lint, type, unit, integration, e2e, axe, visual/print/performance, OpenAPI, build, DB, production audit, diff, and Docker evidence | Complete |
| No mocks/placeholders/dead core UI | Fresh interactive browser workflow and targeted source review; ordinary form placeholders are input hints, not fake content | Complete |

## Evidence and boundaries

- T078's Docker correction fixed the exact standalone startup failure:
  `drizzle-orm` was missing from the migration entrypoint's runtime image. The
  repeated smoke test passed after its targeted copy was added.
- T080 re-ran focused checks after the final release-record refresh: 33 unit,
  22 integration, 3 end-to-end, 2 accessibility, release-quality, and Docker
  persistence all passed.
- The Docker requirement is satisfied by a build/health/persistence test and
  Unraid-compatible package review. No claim is made that a particular
  household's Unraid host was changed.
- No API key was read or exposed and no paid OpenAI request was made. This is
  intentional and compliant with the supplied test rules, which require
  deterministic mocks and separate permission for live requests.

## Known non-blocking limitation

A household can opt into a paid OpenAI action only after deployment by
configuring its runtime key and explicitly confirming the action. That live
operational choice was correctly not exercised during release validation.
