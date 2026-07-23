# T029 rendered slice decision

## Decision: approved

The T027 defects are repaired: every dynamic profile parameter and access-secret byte boundary now returns a non-echoing 400 on invalid input. The signed session, current principal/accessVersion, exact origin, fixed requester identity, safe profile discovery, expiry, and detailed authorization boundaries remain intact. The server API is approved for browser consumption.

The first rendered slice must be useful without pretending unfinished integrations exist. It will add top-level Nutrition navigation and `/nutrition` with private create/unlock, authorized profile switching, Overview, Food Diary, Nutrients, Trends, Household, and Goals views. It will aggregate only latest explicit eaten/corrected diary revisions, show planned allocation counts separately, expose data completeness/estimated labels, provide an accessible seven-day trend plus text/table equivalent, show only server-authorized profile summaries, support managed dependents/guests/unassigned profiles and manual goals, and explain that Pantry/planned/cooked food is not consumption.

It must not fabricate planned calories, recipe logging, household comparison, clinical advice, or source completeness that the persistence/integration layers do not yet provide. Those remain subsequent vertical slices.

Concurrent Pantry T015 owns schema, journal, planning/cooking/list/Pantry UI, and shared docs. The rendered Nutrition slice uses only new Nutrition files plus a precise `app-header.tsx` navigation edit.

The exact GoalBuddy Judge exceeded the single-wait limit without returning. The PM performed the same read-only gate as permitted fallback.
