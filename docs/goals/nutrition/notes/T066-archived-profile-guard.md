# T066 archived-profile intake guard

- Added the archived-profile denial to the shared intake/allocation authorization seam before normal grant evaluation.
- Regression tests delete one profile while preserving the owner session through another managed profile, then prove direct intake and allocation calls throw forbidden and the trusted intake API returns 403 for the archived UUID.
- Active profile behavior remains covered by the unchanged intake, allocation, recipe/product/manual and prepared-consumption suite.
- Verification: 177 unit tests and 102 integration tests passed; focused tests, lint, typecheck and diff checks passed.

The exact GoalBuddy Worker exceeded the single 30-second wait and was interrupted. The PM completed the same bounded repair.
