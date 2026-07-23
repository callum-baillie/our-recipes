# T011 calculation repair

Availability now allocates each product/unit stock pool once across all required recipe ingredients in deterministic order, preventing duplicate mappings from reusing one batch. Projected demand exposes covered, definitive shortage, and uncertain states; approximate or incompatible stock produces explicit uncertainty and nullable shortage math. Date query validation rejects impossible calendar dates.

The repair does not mutate batches, rewrite recipes, change mappings, or implement grocery/cooking behavior. Verification passed with 6 focused unit tests, 3 focused integration tests, 137 full unit tests, 50 full integration tests, lint, TypeScript, OpenAPI, formatting, and diff checks.
