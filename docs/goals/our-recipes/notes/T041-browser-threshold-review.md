# T041 — Browser threshold review

## Decision: safe to continue in a fresh verification task

The two T040 failures are both assertion defects after the browser had already completed the restore request:

1. `Revision 3` is intentionally rendered in both the history row and attribution footer; the original unqualified text locator was non-unique.
2. The selected first revision originates from the existing capture workflow and does not establish the `20 min` fact used by the second assertion. The revised recipe does establish `cookingMethod: oven-roasted`, and the T040 browser flow already confirms that value is visible before restore. Revision 1 correctly omits it.

No code-path, origin, conflict, persistence, profile-isolation, or accessibility failure is indicated. The route uses the existing trusted-origin and active-profile checks; integration tests prove append-only restore, stale conflict protection, rating isolation, and sort order. Axe passed on both T040 browser runs.

## Follow-up decision

T042 is a fresh, deliberately narrow Worker verification task. It may change only the browser assertion from the incorrect time expectation to the absence of `oven-roasted` after restoring revision 1, then run the complete frozen-install/format/lint/type/unit/integration/e2e/a11y/OpenAPI/build/diff gate. It must not alter product behavior or introduce any provider/operations work.
