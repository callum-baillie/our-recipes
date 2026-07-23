# T103 advanced individual-chart audit

Decision: approved after two narrow truth repairs.

The workspace uses at most five fixed queries: profile, latest permissions, current intake/values, optional plan aggregate, and conditional goal history. The plan query is skipped when planned chart presentation is disabled; the goal query is impossible unless the server-loaded access context grants goal management. Diary-only viewers receive no target rows or private profile inputs.

The intake query's correlated newer-revision exclusion precedes acceptance of current state/date, and focused evidence proves a newer deletion outside range suppresses the older consumed row. The conservative UTC envelope followed by exact profile-local date filtering handles near-midnight entries. The single value join and 1,000-entry regression show no per-row value query. The plan join excludes non-active meal-plan status, superseded allocations and absent/ambiguous calculation serving evidence.

Historical goal selection is per series/day and respects highest applicable revision plus its state. Missing calories remain `null`; rolling averages exclude missing values; macro modes consume prebuilt grams/percent data; planned and consumed remain separate; sources use immutable names/types/IDs from confirmed snapshots; and record-completeness copy explicitly disclaims proof that every meal was logged.

The audit found two semantic presentation gaps. First, a specific planned nutrient missing from an otherwise usable recipe calculation inherited an overly optimistic day-level plan-evidence label. Evidence is now evaluated per nutrient and the calorie table explicitly annotates incomplete plan evidence. Second, incomplete nutrient evidence could hide the existence of multiple applicable goals; `ambiguous_goal` now takes precedence while evidence remains separately present. Focused regressions cover both.

The Trends layout uses labeled patterned bar series, exact tables, person/date scope, units, missing states, macro mode buttons with `aria-pressed`, and collapsed advanced source/matrix disclosures. Goal-unauthorized matrix copy is explicit. Narrow layouts stack and retain table overflow. The narrow repairs pass formatting, lint, TypeScript, 18 unit/component tests, 3 workspace integration tests and scoped diff checks. The prior clean full evidence remains 212 unit, 117 integration, lint, TypeScript and production build with the known backup-service NFT warning.

The next safe package is a separately authorized, opt-in weight-trend map. It must not reuse diary permission, must distinguish observations, smoothing and goals, and must avoid exaggerated axes or health interpretation.
