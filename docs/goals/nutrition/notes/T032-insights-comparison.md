# T032 deterministic insights and private household comparison

## Delivered

Added deterministic goal evaluation with explicit minimum day and nutrient-coverage thresholds. Below/within/above status respects minimum, target, range, and limit semantics. Food-first suggestions are calm, preference-aware prompts and are completely suppressed when coverage is inadequate; no diagnosis, disease, danger, or certainty language is generated.

Added a server-only household comparison service and signed-session API. It excludes `comparisonVisibility=hidden` before authorization, requires owner/guardian/explicit `view_comparison` access, honors grant expiry, substitutes server-generated household labels for anonymized profiles, and returns only observed-day counts plus coverage-gated percentages against each person's own active daily goal. It never returns raw diary revisions, timestamps, amounts, measurements, sensitive profile fields, profile IDs, owner IDs, or hidden/anonymized names.

Overview now renders data-quality context and suggestions; Household renders normalized like-for-like goal percentages and explicit raw-data privacy language.

## Evidence

- Focused insights/render suite: 7 tests pass.
- Focused comparison service/API suite: 2 tests pass.
- All Nutrition tests: 85 unit and 20 integration pass.
- Full `pnpm test`: 152 unit and 68 integration pass.
- `pnpm lint`, `pnpm typecheck`, focused Prettier, and scoped diff checks pass.
- Tests prove one comparison-only viewer cannot read another diary; named is named, anonymized is substituted, hidden is absent; raw fields are absent; percentages normalize by different goals; insufficient data suppresses claims; unauthenticated API returns 401.

The existing dev server still does not respond, so direct browser evidence remains deferred without restarting its shared `.next` process.

The exact GoalBuddy Worker exceeded the single-wait limit and was interrupted without making T032 changes. The PM completed the exact package as permitted fallback.
