# T104 opt-in weight-trend map

## Current boundary

`nutrition_body_measurements` already stores immutable timestamped canonical kilograms, manual/imported source, approximate flag and note under a `(nutrition_profile_id, measured_at)` index. Recording requires `manage_profile`; reading requires `view_measurements`. The current list service returns all history, so the chart needs a bounded service rather than loading it through the diary workspace.

`weightTrackingEnabled`, measurement system and target weight live on the private profile row. Accessible profile summaries report `canViewMeasurements` but do not expose weight fields. A diary grant is unrelated and must never authorize the chart.

## Exact authorization and query shape

Create a server-only measurement access context using the same one-profile/one-latest-grants pattern as T102. It must first require `view_measurements`, then report effective `canManageProfile`. Only after authorization may it inspect `weightTrackingEnabled`.

- If tracking is disabled, return a disabled result and do not query measurements. The Trends page omits the weight panel entirely.
- If enabled, run one indexed bounded measurement query: visible 7/14/30 local days plus the preceding six calendar days needed for the first trailing average, inside a conservative UTC envelope followed by exact profile-local date membership. Total ceiling is three queries.
- Return target weight only when the same loaded access context grants `manage_profile`. A measurement-only viewer may see authorized observations but not the private target setting. Diary-only or unrelated principals receive no result.

## Dataset semantics

- Preserve every authorized observation point, timestamp, canonical kilograms, source type and approximate flag. No inferred or projected measurement is created.
- For smoothing, select the latest observation within each profile-local day, then calculate each visible day's trailing seven-calendar-day average from present daily observations only. Missing dates do not become zero and multiple weigh-ins do not give one day extra weight.
- Convert display values server-side from kilograms to the profile's metric kilograms or imperial pounds. Keep canonical kilograms in the dataset/table for traceability where useful. Target is a horizontal factual line, never a projection.
- Do not calculate BMI, recommended weight, rate-of-change advice, diagnosis or success/failure language.
- Compute a non-exaggerating display domain from observations plus any authorized target with at least `max(5 kg, 10% of the series midpoint)` span, centered/padded around the actual range and clamped above zero. Exact table values remain authoritative.
- An enabled profile with no measurements gets a calm empty state explaining how to add an observation in Settings. Approximate/imported/manual status is text and marker shape/pattern, not color alone.

## Largest safe Worker

Add a server access helper, new bounded `nutrition-weight-trend-service`, pure `nutrition-weight-trend` dataset builder, page integration, and an optional weight section in the existing advanced Trends component/styles. No new API or persistence is needed.

Likely allowed files: `src/lib/services/nutrition-profile-service.ts`, new `src/lib/services/nutrition-weight-trend-service.ts`, new `src/lib/domain/nutrition-weight-trend.ts`, `src/app/nutrition/page.tsx`, `src/components/nutrition-dashboard.tsx`, `src/components/nutrition-advanced-chart-panels.tsx`, its module CSS, new unit/integration tests and `tests/unit/nutrition-components.test.ts`.

Verify disabled/no-query, diary-only/stranger denial, measurement-only target withholding, owner/guardian target access, 7/14/30 and near-midnight dates, multiple same-day observations, missing-day smoothing, metric/imperial conversion, approximate/imported labels, safe minimum axis span, empty state, table/units/scope/non-color/responsive rendering, focused/full gates and build. Stop for schema/migration/API changes, all-history reads, diary authorization, browser calculations, BMI/projections/health judgments, household disclosure, external providers, or files outside the package.

Smart-scale, wearable/import sync, household weight comparison and projections remain explicit future extension points.
