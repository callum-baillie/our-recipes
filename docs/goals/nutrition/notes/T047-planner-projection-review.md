# T047 planned projection boundary review

Approved the T046 map with two mandatory hardening conditions.

- The safe package stays entirely within Nutrition-owned files because planner page/component/domain/service files remain dirty under concurrent Pantry work.
- Explicit fractional allocations are the only source of per-person planned nutrients. No equal-distribution default or inferred household-profile assignment is allowed.
- The requested profile is authorized through the Nutrition principal. Other profiles may contribute only to a non-identifying aggregate assigned-serving amount used to derive the shared unassigned quantity.
- Current normalized recipe calculations may drive projections; stale, unavailable, legacy or imported values must remain unavailable rather than becoming current or zero.
- Latest immutable allocation versions drive state. Supersession must preserve the meal-plan/cook-session source identity and reject stale predecessors.
- Over-allocation must be checked inside the same database transaction that appends the new allocation version, including the latest version of every allocation series.
- Planned and served portions can contribute to a planned projection, while eaten totals come only from current immutable consumed intake. Skipped and leftover portions do not become consumed.

Cooking completion, Pantry deduction, prepared yield, serving confirmation and atomic intake-plus-eaten-allocation remain the next separately reviewed boundary.

The exact GoalBuddy Judge exceeded the single-wait limit and was interrupted. The PM performed the same read-only approval gate as permitted fallback.
