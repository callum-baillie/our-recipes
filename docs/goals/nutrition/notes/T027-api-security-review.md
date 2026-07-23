# T027 authenticated API security review

## Decision: rejected

The signed-session boundary, current `accessVersion` and archival recheck, HttpOnly/SameSite cookie, exact trusted-origin mutation guard, server-owned requester ID, expired-grant filtering, safe accessible-profile summaries, owner-only sharing history, fixed service authorization, and generic error hiding all pass review.

Two HTTP input-validation defects block browser use:

1. Dynamic `[profileId]` route parameters are passed directly to services without validating UUID shape. Queries are parameterized, so this is not SQL injection, but it violates the repository's validate-all-HTTP-input boundary and produces inconsistent not-found behavior instead of a 400 validation response.
2. Identity bootstrap validates secret character count in the route but the credential layer enforces UTF-8 byte count. A multibyte secret under 256 characters but over 256 bytes reaches the credential layer and is mapped to a generic 500 rather than an input 400.

The repair is API-only: centralize strict UUID and UTF-8 byte schemas in the Nutrition route helper, apply them to every profile route plus identity/login, and add regression tests for invalid paths, invalid multibyte secrets, trusted origins, and absence of error input leakage. No service, persistence, UI, Pantry, docs, or OpenAPI change is required.

## Harness note

The exact GoalBuddy Judge exceeded the single-wait limit without returning. The PM performed the same read-only gate as permitted fallback.
