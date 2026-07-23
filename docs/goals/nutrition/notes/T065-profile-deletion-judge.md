# T065 irreversible deletion Judge

Decision: `repair_required`.

Exact confirmation, expected-version comparison, `delete_data`, trusted origin, one-transaction dependency cleanup, newest-first self-referential histories, sensitive scrubbing, shared prepared evidence/household recipe preservation, owner-credential rotation and requester-cookie safety pass inspection and tests.

One post-archive denial gap remains. `nutrition-profile-service.ts` now rejects archived profiles, but `nutrition-intake-service.ts` retains its own authorization seam and does not inspect `profile.archivedAt`. When the owner keeps a valid credential because another managed profile remains, direct intake/allocation APIs can address the archived UUID and repopulate deleted private rows. Repair the shared intake authorization seam to reject archived profiles and add service/API regression proof that an archived profile cannot receive new intake, allocation, recipe/product/manual integration or lifecycle data.

The exact GoalBuddy Judge exceeded the single 30-second wait and was interrupted. The PM performed the same read-only gate as permitted fallback.
