# T059 — Tag removal acceptance defect

## Reproduction

1. Complete first-run setup and add two household tags in `/tags`.
2. Rename the first tag, merge it into the second, and confirm **Remove** on
   the remaining tag.
3. The `DELETE /api/v1/tags/{tagName}` response is `204 No Content`, but the
   tag row remains visible for at least the browser assertion timeout.

## Cause

`TagManager.remove` parses every successful response as JSON. A successful
`204` produces `null`, then its `if (payload === null) return` branch exits
before removing the tag from local React state or calling `router.refresh()`.
The server-side `deleteTag` service and DELETE route have already performed the
deletion, so the browser displays stale household-tag state.

## Boundary

T059 is a verification-only task and cannot change
`src/components/tag-manager.tsx` or the tag API contract. The expanded
fresh-household acceptance test remains intentionally failing at the visible
row-removal assertion so a narrow implementation follow-up can fix the real
interaction rather than weaken the test.
