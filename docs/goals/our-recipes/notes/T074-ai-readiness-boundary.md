# T074 — safe AI-readiness boundary

Date: 2026-07-13  
Status: complete without an OpenAI SDK, credential lookup, or provider call.

## Delivered

- Strict server-only Zod shapes for review-only AI candidates, uncertainty,
  source identifiers, operation kinds, and a non-secret disabled status.
- A server-only `AiProvider` interface and `UnconfiguredAiProvider` that
  reports `OpenAI` as `unconfigured` and rejects attempted review work with a
  typed unavailable error. It has no SDK dependency, environment lookup, or
  network capability.
- A deterministic test-only provider fake, unit coverage for strict rejection
  and unavailable-provider behavior, `/api/v1/ai/status`, and an accessible
  **AI status** settings page linked from the kitchen navigation.
- Architecture/security/API/testing/readme/status/release docs and decision
  0026 describing this as a preparatory boundary rather than a feature claim.

## Explicit non-claims

- No OpenAI key was read, no model was configured, no SDK was added, and no
  request or image generation is possible.
- No route uses a mock to create or modify a recipe. The test fake is not part
  of production code or UI.
- A future concrete OpenAI provider, credential lookup, feature controls, and
  live verification still need the user-required credential decision. A paid
  live request additionally needs explicit approval.

## Verification

- Full gate passed: frozen install; format/lint/type/build; 32 unit and 21
  integration tests; 3 browser acceptance tests; 2 accessibility tests;
  release-quality/print/performance; local OCR smoke; database check; clean
  production dependency audit; and diff check.
- OpenAPI is valid. Redocly retains its existing warnings and adds one
  non-blocking `operation-4xx-response` warning because the read-only status
  endpoint intentionally has no 4XX response path.
- Turbopack retains the unrelated backup-route file-tracing warning.
