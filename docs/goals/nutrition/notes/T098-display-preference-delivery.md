# T098 display-preference delivery

Delivered three private Nutrition display preferences through the existing signed, trusted-origin, `manage_profile`, optimistic-version profile seam.

- Additive migration `0024` gives every existing/new profile deterministic non-null defaults for the eight factual default coverage nutrients, a seven-day trend, and planned-value visibility. Applied migration SQL was not changed.
- Validation accepts only canonical nutrient codes, one to twelve submitted values, deduplicates them in stable order, restricts the range to 7/14/30, and validates the planned display flag. Persistence remains server-owned JSON/integer data; accessible summaries expose only these non-sensitive display choices.
- Private Settings explains that the controls change presentation only and do not edit diary entries, meal plans or goals. The existing full-profile payload round-trips the selected nutrient list, trend range and planned display flag under the same expected profile version.
- Goal-backed coverage filters to the selected codes and retains the explicit empty state. The page builds 7/14/30 timezone-aware diary ranges with missing days still `null`; trend heading, accessible label and table caption state the selected range.
- Turning off planned display omits only the planned Overview metric and planned calorie chart/table rows. The server dataset still retains the planned amount, and confirmed calorie goal comparison remains unchanged. The Nutrition meal-planning projection is neither deleted nor reclassified.

Verification passed: 43 focused unit tests, 5 focused profile integration tests, 203 full unit tests, 114 full integration tests, lint, TypeScript, focused formatting and scoped diff checks. A unique disposable SQLite file migrated through `0024`; direct `PRAGMA table_info` inspection confirmed all three non-null defaults. The production build passed with the existing backup-service NFT trace warning. No interactive browser, Docker, PWA, backup, Unraid or device behavior is claimed.
