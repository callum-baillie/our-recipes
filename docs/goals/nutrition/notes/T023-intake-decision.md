# T023 private-security re-review and intake decision

## Decision

Approved. Full-profile reads now have a fixed `manage_profile` check; narrow viewers use dedicated list functions and cannot retrieve the sensitive profile. Credential, revocation, household non-authority, grant history, goal history and measurement boundaries pass.

## Intake model

Add migration `0019_nutrition_intake` with two append-only version streams:

1. meal-allocation versions linked optionally to a meal-plan entry/cook session, recording one Nutrition profile's explicit planned/served/eaten/skipped/leftover state and portion; and
2. intake revisions recording explicit eaten/skipped/corrected/deleted diary state with immutable nutrient values and a JSON provenance snapshot containing source IDs, calculation version/digest, original basis, confidence and completeness.

Planning, Pantry availability, Pantry deduction, cook completion, and allocation creation must never create consumed intake automatically. An authorized owner/guardian action is required to record eaten intake. Corrections append a revision and preserve earlier nutrient snapshots.

## Worker package

Allowed files: schema, additive migration 0019, journal, new `nutrition-intake` domain/service files, and focused unit/integration tests. No route/UI/docs/Pantry/planner/cooking edits.

Reads require `view_diary`; writes require `manage_profile` (owner or guardian). Each revision validates latest-supersession, same profile/series, exactly one source type, complete snapshot provenance for eaten data, sparse non-negative nutrient rows, and no nutrients for skipped/deleted state.

After the Worker, require a history/privacy Judge before routes or cross-feature mutations.
