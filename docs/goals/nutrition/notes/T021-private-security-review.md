# T021 private Nutrition security review

## Decision

Rejected pending one focused repair.

Credential hashing, access-version rotation, household-profile non-authority, deny-by-default grants, append-only permission/goal/measurement rows, optimistic profile updates, and server-only storage all passed review. However, `getPrivateNutritionProfile(profileId, requester, action)` accepts an arbitrary action and returns the complete sensitive profile whenever that action is allowed. A viewer granted only `view_measurements` could therefore request the full profile through an incorrectly wired caller.

The repair removes the caller-selectable action. Full profile reads must always require `manage_profile`; narrow measurement reads continue through `listBodyMeasurements`, which returns only measurements. Tests must prove a measurement-only viewer can list measurements but cannot retrieve the profile.

No migration/schema/domain/API/UI change is required. After the repair, repeat the security Judge before intake.
