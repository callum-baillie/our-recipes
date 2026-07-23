# T033 insights and comparison review

## Decision: rejected

Privacy and communication boundaries pass: hidden profiles are excluded before access evaluation; comparison requires owner/guardian/explicit permission; expired grants are denied by the shared authorization function; anonymized names are replaced; raw diary, timestamps, measurements, amounts, profile/principal IDs and sensitive fields are absent; normalized percentages use each person's own active goal; insufficient member data yields no nutrient comparisons; suggestion language is calm and non-clinical.

Two calculation defects block approval:

1. Active-profile insights gate every goal with a single average completeness across all recorded nutrient values. High completeness for calories/protein could authorize a fiber or micronutrient suggestion whose own values have poor completeness. Quality must be nutrient-specific.
2. Comparison observed-day counts and the page's recent-value coverage matching use UTC date slices, while diary totals/trends use each profile's configured `dailyResetTimezone`. Entries near midnight can fall on different days, producing inconsistent observed-day thresholds and normalized averages.

Repair by exposing the existing local date-key logic, using it consistently for page and comparison period buckets, passing per-nutrient coverage to insight evaluation, suppressing only the affected nutrient when its coverage is inadequate, and adding near-midnight plus mixed-completeness regressions. No persistence, API shape, UI layout, Pantry, or docs change is needed.

The exact GoalBuddy Judge exceeded the single-wait limit. The PM performed the same read-only gate as permitted fallback.
