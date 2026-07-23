# T086 private Nutrition settings delivery

Nutrition now includes a `Settings` view only for a signed identity that can manage the selected private profile. The server loads that one complete profile through the existing `manage_profile` authorization path; non-managers receive no private settings payload and do not see the Settings navigation item.

The dedicated form exposes every already modeled field and submits the existing strict, trusted-origin, optimistic-version PATCH contract. Optional sensitive inputs are preceded by an explanation of why they may be requested, are never inferred, and remain unnecessary for manual goals. Metric and imperial entry are labeled explicitly and deterministically converted to canonical centimeters/kilograms before submission. Dietary preferences, allergies and exclusions remain user-entered lists. Comparison and diary visibility wording makes explicit that access still requires authorization.

Estimator input and consent controls are truthful: the view states that saving those values does not calculate, create or replace a goal and that manual goals remain available. No reference values, estimator, schema, migration, service, API, permission, recommendation, Pantry, planner or shopping behavior changed.

Verification passed: 27 focused component/profile unit tests, 8 focused profile service/API integration tests, 187 full unit tests, 110 full integration tests, full ESLint and TypeScript, focused Prettier/scoped diff checks and a production build. The first full integration attempt hit a Windows `EPERM` rename in the unrelated backup restore test; its single focused retry and the subsequent full 110-test integration suite passed. The build retained the existing backup-service NFT trace warning.

The exact GoalBuddy Worker exceeded the single 30-second wait and was interrupted. The PM completed the same bounded allowed-file package as permitted fallback.
