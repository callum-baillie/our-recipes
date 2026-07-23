# T101 advanced aggregate review

Decision: approved with a privacy correction.

The correlated latest-revision design is correct: the outer row is range-bounded through the profile/occurred index, while `NOT EXISTS` checks every newer revision in the series before current state is accepted. A deletion or move outside the requested range therefore cannot resurrect an older row. A single left-joined nutrient query preserves confirmed entries that lack selected nutrient values and avoids the existing per-row value lookup.

The proposed historical goal query cannot run under `view_diary` alone. Existing server behavior protects goal reads with `manage_goals`; clinician/user targets can be sensitive. Add one server-only access-context helper in `nutrition-profile-service` that uses the same profile plus latest-grant queries to authorize diary viewing and report effective `canManageGoals` without exposing profile inputs. The workspace remains at most five queries:

1. profile;
2. latest permission versions;
3. current joined intake/values;
4. bounded current plan aggregate;
5. goal history only when the access context grants goal management.

When goal context is not authorized, charts return an explicit `goalContext: unavailable` and show factual diary/plan data without target bands, heatmap status or implying no goals exist. Owner/guardian/current explicit permission semantics must match `listAccessibleNutritionProfiles`. No browser flag may authorize the goal query.

Approve the remaining formulas from T100: exact local 7/14/30 days after a conservative indexed UTC envelope; missing confirmed values as `null`; trailing seven-day average over present confirmed values only; macro percent only with all three required macros; per-day highest applicable goal revision then selected state; separate planned and consumed values; immutable snapshot source grouping; and strict record-evidence completeness without claiming every meal was logged.

The planned query must be one joined latest-allocation/current-recipe-revision calculation/value query. Unavailable or ambiguous calculation/serving evidence stays unavailable, not zero. Source links use only stored authorized recipe/product IDs. Browser controls may select an already-built macro representation/source nutrient but may not calculate totals.

Render calorie and macro trends, planned-versus-consumed and record completeness on Trends. Put source ranking and the semantic heatmap in named advanced disclosure sections. Every visual needs scope, units, factual summary, non-color status and a table equivalent; narrow layouts stack or scroll. For goal-unauthorized viewers, the heatmap disclosure explains why semantic comparison is unavailable.

Allowed files must include the new access-context helper and its focused service regression, the new individual workspace/domain/component/style files, page/dashboard integration and focused unit/integration/component tests only. No schema/migration/API/preferences/measurements, existing intake/planning service, card/planner/Pantry/recommendation/household files may change.
