# T107 — weight trend audit

## Decision: approved

The T106 slice satisfies the approved weight-trend boundary.

## Authorization and query bounds

- The page's safe profile summary is only an early gate. The service independently calls a server-only access helper that requires `view_measurements`.
- The helper performs the profile and latest-per-principal permission-history queries. Integration spies confirm two prepared statements on the tracking-disabled path.
- The tracking flag is checked before `getSqliteDatabase().prepare(...)` for measurements. The enabled path adds exactly one bounded measurement query, and the test confirms three prepared statements total.
- Target weight is projected only when a second authorization decision grants `manage_profile`. A measurement-only viewer receives observations and `targetWeightKilograms: null`; owner and guardian paths receive the target.
- No private profile object, diary record, note, or measurement author identity enters the chart workspace.

## Dates, smoothing, units, and axis

- The query envelope is bounded to the selected 7/14/30-day period plus six leading local dates and 36-hour timezone padding. Rows are then filtered to the exact profile-local date set.
- All visible measurements remain separate observations. The rolling series first selects the latest timestamp per local day and averages only present daily values in the trailing seven calendar dates.
- Tests cover all three ranges, a near-midnight Los Angeles boundary, multiple same-day observations, missing days, and the six leading days.
- Kilogram-to-pound conversion and display rounding are server-owned. Canonical kilograms remain available in the table.
- The axis includes observations, averages, and an authorized target, with minimum span `max(5 kg, midpoint * 0.1)`. Browser code only consumes server-projected percentages.

## Rendering and language

- Weight rendering is independent of diary access, while each path retains its own access boundary.
- Disabled tracking renders nothing; enabled/no-visible-observation renders an explicit empty state.
- Ready rendering provides different shapes and a dashed target marker, text legend, exact observation table, rolling table, timestamp, source, approximate state, person/date/unit scope, and responsive overflow/grid rules.
- The weight code contains no BMI, projection, diagnostic, clinical, or health-judgment language.

## Verification evidence

Focused tests, lint, typecheck, full 222-unit/123-integration suite, and the production build passed. The only build warning remains the pre-existing backup-service NFT trace warning.

The exact GoalBuddy Judge exceeded its single bounded wait and was interrupted. This PM audit applied the same read-only rejection criteria as the permitted fallback.
