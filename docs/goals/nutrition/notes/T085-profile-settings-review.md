# T085 private profile-settings review

## Decision: approved

T084's first package is approved. The profile schema and trusted-origin `PATCH /api/v1/nutrition/profiles/{profileId}` contract already enforce strict full-input validation, private `manage_profile` authorization and optimistic version conflicts. The Worker may expose those existing values without changing persistence, authorization, reference data or goal behavior.

The settings view must be absent for profiles the signed principal cannot manage. It must explain optional sensitive inputs before rendering their controls, never infer them, keep dietary lists user-authored, and clearly distinguish the metric/imperial display preference from canonical server values. If the form accepts imperial height/weight, conversion to canonical centimeters/kilograms must be deterministic and tested. Enabling and consenting to estimator inputs may save those inputs only; the UI must explicitly state that it does not create or replace a versioned goal. Manual goals remain fully usable without sensitive inputs.

The Worker is limited to the Nutrition page/dashboard, a dedicated profile-settings component/styles and focused component tests. It may not change schema, migrations, domain/service/API permissions, numeric references, recommendation logic, Pantry/planner/shopping behavior or browser persistence. Verification must include render/payload/unit checks, existing profile schema/service/API tests, full tests, lint, typecheck, scoped formatting/diff and a production build.

After delivery, the next unresolved settings dependency is a separately sourced and reviewed personalized DRI/EER/reference-goal package. Individual accessible chart datasets and profile display preferences follow that review; they must not use FDA Daily Values as personalized targets.

The exact GoalBuddy Judge exceeded the single 30-second wait and was interrupted. The PM performed the same read-only review as permitted fallback.
