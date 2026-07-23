# T099 display-preference audit

Decision: approved after one narrow accessibility repair.

Migration `0024` is additive and journaled after `0023`. Its three columns are non-null with deterministic defaults, and SQLite directly reported the expected default values after a fresh disposable migration. Domain validation restricts the list to canonical codes, bounds submitted length, deduplicates it, and restricts the trend window to 7/14/30. The existing full-profile PATCH retains signed identity, exact trusted origin, `manage_profile` and optimistic version conflict behavior.

Accessible profile projection exposes only the non-sensitive display settings and falls back to factual defaults for invalid stored list JSON. The private Settings form round-trips all three values and explicitly says it changes presentation rather than diary, plans or goals.

Coverage selection filters rows without changing their goal semantics and retains the empty state. Trend generation preserves profile-local date bucketing and `null` missing energy days across the chosen range; heading, accessible label and table caption are dynamic. Disabling planned chart display keeps planned energy in the server dataset and leaves the meal projection intact while omitting only the Overview metric/chart/table presentation.

The audit found that the hidden-planned state still used an `aria-label` announcing planned calories. The component now labels that state only “Confirmed calories,” with a focused regression. The repair passed formatting, lint, TypeScript, 18 focused component/dataset tests and scoped diff checks. The original full evidence remains 203 unit tests, 114 integration tests and a passing production build with the known backup-service NFT warning.

No macro-mode, card/planner flag, historical aggregate, measurement, household or Pantry behavior was added. The next safe task is an exact read-only design of the bounded latest-revision aggregate/source query and non-weight advanced individual datasets before any performance-sensitive Worker.
