# 0027 — server-only OpenAI and browser HEIC/HEIF conversion

## Status

Accepted on 2026-07-13. The operator authorized reuse of an existing local
development key and local Docker validation, but did not authorize a paid live
OpenAI request.

## Context

Recipe capture must stay review-first. HEIC/HEIF camera files are common on
household devices, while the server's image boundary deliberately accepts only
byte-validated JPEG, PNG, and WebP.

## Decision

- Use the official `openai` JavaScript SDK in server-only provider modules.
  `OPENAI_API_KEY` is read from the environment in every runtime; a project
  `.api_keys` fallback is development-only. That file is ignored and explicitly
  excluded from Docker build context.
- Use Responses Structured Outputs with a separate all-required output schema,
  then revalidate/normalize with the application recipe schema. Provider
  operations accept only bounded text or previously normalized scan artifacts,
  require explicit confirmation, use a four-action-per-profile ten-minute
  process limit, and write a no-raw-content audit row.
- Use browser-only `@discourse/heic` WASM conversion for HEIC/HEIF selections.
  It creates an in-memory JPEG before `FormData`; raw HEIC/HEIF bytes never
  reach the server. The existing byte-derived server gate stays unchanged.
- Keep generated images review-safe: an explicit image-generation click is the
  only trigger; the returned bytes go through the existing local image pipeline
  and only the local image ID is retained in the audit record.

## Evidence and limits

- Unit and integration tests inject deterministic providers; no test makes a
  network request to OpenAI.
- The Chromium acceptance flow converts real small HEIC and HEIF codec fixtures
  before the existing import route accepts the resulting JPEGs. Fixture source
  and upstream license notice are recorded next to the test data.
- A paid live provider call remains deliberately unverified and requires a
  separate explicit operator approval. Docker validation may prove packaging
  and persistence but cannot prove provider billing or account configuration.
