# T067 irreversible deletion approval

Decision: `approved`.

The deletion boundary now denies archived profiles at both the profile-service and shared intake/allocation authorization seams. Manual intake, recipe/product integration, planner/allocation and prepared-consumption mutations all traverse one of those gates; comparison queries already exclude archived profiles. Regression tests retain a valid owner session through another profile and prove service intake/allocation and trusted API repopulation attempts are forbidden. Active-profile behavior remains green in the full 177-unit/102-integration oracle.

The next full-brief package is preparation-aware recipe calculation evidence from T056 rank 2.

The exact GoalBuddy Judge exceeded the single 30-second wait and was interrupted. The PM performed the same read-only gate as permitted fallback.
