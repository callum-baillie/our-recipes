# Predictions and reviewed bulk chat actions

`/predictions` exposes the account-and-profile-scoped Decisions history, including original evidence, selected alternatives, model confidence, probability distributions for new results, timestamps, expiry and saved corrections. It includes all kitchen-review task types from pages and chat. It does not copy chat transcripts, recipe generation output, store-map extraction or periodic Responses summaries into the history. Those remain in their existing workspaces. A model choice probability is not a calibrated real-world success rate.

New on-demand Decisions tasks:

- `pantry_expiry`: freshness review windows relative to the saved batch intake timestamp, using recorded package dates, opening, preparation and storage. Intake time is not manufacture time. Estimates never replace a printed use-by date or certify safety.
- `pantry_location`: suggestions drawn only from active saved storage locations; no automatic stock movement.
- `next_shop`: shopping urgency from tracked inventory, low-stock indicators and up to 100 reported completed trips. Tracked stock counts are not a measure of physical pantry fullness.
- `meal_success`: seven-day plan follow-through outlook using up to 280 entries each from the preceding 28 days and next seven days. Completed cooking is distinguished from skipped/cancelled plans and does not prove eating.
- `goal_success`: exploratory outlook for up to 20 coverage-qualified nutrition recommendations. Missing or unrepresentative diary coverage cannot establish goal progress.

Each task includes an unknown outcome. Requests use the existing credential gate, explicit paid-request checkbox, cache, account budget, execution cancellation and sharing controls. Nothing runs paid predictions automatically on scan, page load or a schedule. Changes require review through the existing editors/chat proposals. Predictions remain hypothetical until evaluated against real outcomes; no live provider evaluation was performed.

Migration 0083 adds account/profile-scoped `shopping_trips` with a reported completion date, large/top-up size, note and creation time. `GET/POST /api/v1/shopping-trips` reads/records this history. A checked shopping-list item does not automatically establish a completed large shop. Chat exposes the same operations through `listShoppingTrips` and `recordShoppingTrip`. The predictions page provides a manual entry form. Future completed dates and invalid dates are rejected. This is additive; applied migrations are unchanged.

`GET /api/v1/ai/decisions?history=true&offset=0` returns 20 saved kitchen decisions at a time, scoped by both authenticated account and active profile. Historical evidence is retained for the owner to inspect, even when the result has expired. This history endpoint is not exposed as a general model read tool.

`prepare_bulk_app_actions` accepts a discovered operation ID and 1–20 explicit target parameter/body pairs. It expands into the existing reviewed action pipeline, preserving per-target versions, permissions, signed actor handling, expiry, source checks and partial-failure/replay behavior. It supports the existing pantry, recipe, plan and list write operations; larger requests require separate reviewed groups. Batch execution is not atomic. `prepare_app_actions` remains available for mixed operations and dependent creates.

The catalog also exposes authorized nutrition goal history and reviewed goal versions. Goal sharing and existing diary-sharing gates apply to the receiving profile. A prediction never authorizes a goal change.

Validation: deterministic unit/integration tests cover account/profile isolation, pagination, migration creation, sharing gates, bulk bounds, date validation, credential/paid gates and provider refusal/incomplete responses. Existing chat/operation and assistance-loading regression suites were also run. No paid OpenAI calls, production migration, deployment or Docker verification was performed.
