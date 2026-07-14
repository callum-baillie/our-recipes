# 0022 — Fresh-household local acceptance flow

- Status: accepted
- Date: 2026-07-13

## Context

Focused unit, integration, accessibility, and browser tests covered the
household features, but the release checklist needed one current journey that
proved the supported local workflow together from an empty data root.

## Decision

- The existing `pnpm test:e2e` Chromium journey is the fresh-household local
  acceptance flow. It starts at first-run setup and exercises real UI/API
  behavior through profile archive/restore, tag create/rename/merge/removal,
  collection membership/order/cover, review-first capture/import/JSON-LD,
  JSON-LD and Markdown export responses, rich recipe revisions/preferences,
  cooking, planning/shopping/ICS, PWA reading, and backup validation.
- The flow keeps the deterministic public-URL candidate fixture because it
  verifies the browser review contract without making a live external request.
  All other assertions use the ordinary local browser/UI/API route path and
  generated test data.
- A `204 No Content` response from tag deletion remains the API contract. The
  client response helper now distinguishes a successful empty response from a
  failed request, allowing the confirmed deletion to reconcile React state
  immediately. The visible row-removal assertion is retained as the regression
  proof.

## Consequences

This closes the local combined-workflow release checklist item. It does not
prove Docker/Unraid deployment, a live or mock OpenAI provider, OCR, HEIC/HEIF,
or archive intake; those remain separate acceptance and operational packages.
