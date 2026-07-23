# T034 nutrient quality and timezone repair

Exported one profile-local Nutrition date-key function and now use it for diary trends, Overview recent-value selection, and household comparison observed-day buckets without changing stored timestamps. Near-midnight regression evidence proves three America/Los_Angeles diary days remain three days even when they occupy only two UTC dates.

Insight evaluation now receives completeness by nutrient. Each goal independently requires enough days and its own nutrient coverage; a well-covered calorie record cannot authorize a poorly covered fiber insight or suggestion. Quality messaging explains this per-nutrient threshold.

Evidence: focused domain tests 6 pass, comparison integration 1 passes, TypeScript and focused lint pass, full suite 154 unit and 68 integration passes, repository lint, focused Prettier and scoped diff checks pass.

The exact GoalBuddy Worker exceeded the single-wait limit and was interrupted; the PM completed the exact repair as permitted fallback.
