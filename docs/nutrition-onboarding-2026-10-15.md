# Guided nutrition onboarding

Nutrition setup now uses short screens for account connection, age/formula inputs, measurements,
activity, goals, target pace, dietary preferences, tracking, and review. Measurements are optional
and start empty. Advanced body measurements are entered in one dialog and stored with the profile
and initial weight-history entry when tracking is enabled.

Adult BMI and its reference weight range appear only with valid adult age, height and weight.
The reference range is screening information, not an individual ideal-weight prescription.
Pregnancy, breastfeeding and dependent profiles do not receive these adult suggestions.
Loss pace suggestions are withheld for current or target weights below the adult reference range.
Estimated calorie targets remain opt-in. Pace timeframes are approximations, not guarantees.

## VeSync ESF24

Authentication uses `tsvesync` 1.6.1, with USA selected initially and an editable country code.
The ESF24 reader follows the historical request in pyvesync PR 108. The user chooses their
measurement before importing it, including when only one scale user is returned. Only weight
and measurement time have a sufficiently documented unit contract; composition values are not
inferred. Sync in the VeSync app first. Cloud availability varies and this integration has not
been confirmed against a live ESF24 account.

Passwords are not persisted. Provider sessions are encrypted using a key derived from the app's
auth secret. Pending connections expire after 30 minutes and are bound to an HTTP-only cookie.
Profile creation claims the pending connection in its transaction. A first weigh-in is marked as
imported only when it matches the saved provider reading. Nutrition settings provide explicit
sync and disconnect controls; repeated syncs deduplicate measurements. Private nutrition data
deletion also removes the connection. Rotating the app auth secret requires reconnecting VeSync.

## Sources

- https://github.com/mickgiles/tsvesync
- https://github.com/webdjoe/pyvesync/pull/108/files
- https://www.cdc.gov/bmi/adult-calculator/
- https://www.niddk.nih.gov/health-information/weight-management/healthy-eating-physical-activity-for-life/health-tips-for-adults
- https://www.nationalacademies.org/read/26818/chapter/7

## Checks

TypeScript and targeted ESLint checks were used during implementation. No live VeSync credentials
or paid provider calls were used. Automated tests and browser interaction were not run for this change.

## V3 follow-up

The reader now uses the live-confirmed V3 history endpoint and imports body-fat percentage as well
as weight/date, with additional-profile labels. See [the investigation follow-up](vesync-live-investigation-2026-10-15.md#follow-up-v3-resolves-missing-recent-history) for current findings; it supersedes the original weight-only limitation above.
