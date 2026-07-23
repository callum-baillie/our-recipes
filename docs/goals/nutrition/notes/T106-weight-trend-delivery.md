# T106 — authorized weight trend delivery

## Outcome

Delivered the approved opt-in individual weight trend without adding persistence or API surface.
The server authorizes `view_measurements`, reads the tracking flag before the measurement query,
and exposes the configured target only when the same requester also has `manage_profile`.

## Bounded server projection

- The access context uses two queries: profile plus latest permission history.
- Disabled tracking returns before the third measurement query.
- Enabled tracking issues one bounded timestamp-envelope query, then filters to the exact profile-local 7, 14, or 30 visible days plus six leading days.
- Every visible observation remains distinct. The rolling series selects only the latest observation per local day and averages present days in each trailing seven-calendar-day window.
- Kilogram-to-pound conversion, target inclusion, and the vertical axis are calculated on the server. The axis spans at least the larger of 5 kg or 10% of its midpoint.

## Presentation and privacy

- Measurement-only viewers can see authorized observations but not the target.
- The panel is independent of diary access, so a measurement-only viewer can see weight while food trends retain their own access boundary.
- Disabled tracking renders no panel. Enabled tracking with no visible observations renders a calm empty state.
- The ready state provides non-color observation, average, and target markers plus exact observation and rolling-average tables with timestamps, canonical kg, source, and approximate state.
- Copy is factual and contains no BMI, projection, clinical, or health interpretation.

## Verification

- Focused domain/component/service suite: 25 tests passed.
- Query-count integration assertions: disabled access used two queries; enabled access used three.
- Full unit suite: 222 tests passed.
- Full integration suite: 123 tests passed.
- Lint, typecheck, focused Prettier, and production build passed.
- Build retained the pre-existing backup-service NFT trace warning; it did not fail the build and is outside this package.

## Remaining work

A read-only Judge must audit authorization, query bounds, local-day smoothing, units/axis,
target privacy, and accessible rendering. Card/planner display flags, household analysis,
offline/performance documentation, and rendered final evidence remain later Nutrition slices.
