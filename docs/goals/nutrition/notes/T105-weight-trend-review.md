# T105 weight-trend review

Decision: approved.

The weight chart must use a dedicated server access context. One profile query and one latest-permission query first require `view_measurements`; diary access is irrelevant. Only then may the service inspect `weightTrackingEnabled`. A disabled profile returns no chart and executes no measurement query. The same loaded grants determine `canManageProfile`; target weight is returned only for that stronger access, while a measurement-only viewer receives observations without the target setting.

Approve a maximum three-query service: profile, grants, then one indexed measurement range query only when enabled. The range includes the chosen 7/14/30 local days plus six leading calendar days, with a conservative UTC envelope and exact profile-local date filtering.

All observation points remain distinct and retain time, kilograms, source and approximate status. Smoothing first selects the latest observation on each local day and then averages present daily observations in the trailing seven calendar days. Missing days never add zero or a denominator; multiple weigh-ins do not overweight a day.

Canonical kilograms remain server truth. The dataset supplies server-converted kilograms or pounds, target/axis values and labels based on the profile measurement system. The axis domain includes observations and any authorized target, has at least `max(5 kg, 10% of the series midpoint)` canonical span, uses symmetric padding where possible and never falls below zero. Exact table values prevent the visual scale from becoming the sole evidence.

The optional panel must distinguish observation points, seven-day average and target through labels plus marker/line patterns, show approximate/manual/imported text, include person/date/unit scope and an exact table, and provide a calm enabled-but-empty state. It must contain no BMI, recommended range, projection, rate advice, diagnosis or success/failure copy.

Allowed files are limited to the profile access helper, new weight service/domain, page/dashboard/advanced panel/style integration and focused unit/integration/component tests. No schema, migration, API, external provider, household, Pantry, card/planner or recommendation file may change.
