# T026 authenticated Nutrition server boundary

## Outcome

Added a dedicated signed Nutrition session boundary using the existing production-gated cookie secret. The HttpOnly, SameSite=Strict cookie is accepted only when its signature, audience, lifetime, principal ID, live non-archived principal, and current `accessVersion` all match. Credential rotation and principal archival immediately invalidate old cookies.

All Nutrition mutation routes reject missing or non-exact browser origins using the repository trusted-origin helper. Every private read resolves the server-side cookie; no route accepts a requester principal ID from the client and no route treats the switchable household `ActorContext` as Nutrition authorization.

The APIs cover identity bootstrap, login/logout/session, safe accessible-profile summaries, managed dependent/guest/unassigned profiles, full owner/manager profile reads and optimistic updates, owner-only sharing history and grant/revocation, goals, measurements, immutable diary revisions, and meal allocations. Service/domain validation remains authoritative and errors are mapped without credential hashes or secrets.

Accessible profile lists omit sensitive fields and now exclude expired grants before returning even display-name summaries. Adult profiles must bootstrap their own private identity; managed profiles share the authenticated owner's principal so dependents need no account.

## Evidence

- Focused API/session/profile/intake integration: 12 tests pass
- Full `pnpm test`: 142 unit and 59 integration tests pass
- `pnpm lint`: pass
- `pnpm typecheck`: pass
- Focused Prettier and scoped `git diff --check`: pass
- Direct route tests prove exact trusted-origin enforcement, HttpOnly/SameSite cookie issuance, no secret/hash response, authenticated managed-profile creation, safe summaries, full-profile authorization, rotation invalidation, and old-credential rejection.

## Deferred ownership

OpenAPI and shared API documentation remain deferred because the concurrent Pantry repair owns those files. No UI files were touched.

## Harness note

The exact GoalBuddy Worker exceeded the single-wait limit and was interrupted without making T026 changes. The PM completed the exact bounded package as permitted fallback.
