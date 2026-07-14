# 0026 — AI readiness is strict and disabled until the credential gate

## Decision

Add a server-only `AiProvider` interface and strict Zod review-candidate
contract before implementing OpenAI. The only production provider is
`UnconfiguredAiProvider`: it reports a non-secret disabled status and rejects
all attempted review work with a typed unavailable error. The Settings screen
and `/api/v1/ai/status` make that state visible without inspecting an
environment variable or exposing a test result as a household feature.

## Consequences

- Deterministic test fakes can verify the same review contract without a key,
  network call, provider SDK, or paid usage.
- No route persists or changes a recipe through AI; all real text, vision, and
  image adapters remain absent.
- Adding the official OpenAI SDK, a key lookup, model configuration, an
  `OpenAiProvider`, image generation, or any API request requires the separate
  operator credential decision required by the product specification. A live
  paid call also needs explicit approval.

This is a preparatory boundary, not an OpenAI implementation claim.
