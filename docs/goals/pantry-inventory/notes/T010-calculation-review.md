# T010 calculation-correctness review

Decision: rejected. T009 correctly preserves recipe text, attributes mappings, scales servings, pools exact stock across meals, and performs no stock mutation. Three blocking calculation issues remain:

1. duplicate ingredients mapped to one product each see the full stock pool, so a recipe can be falsely marked ready;
2. approximate or incompatible stock is excluded but not surfaced as uncertainty, leaving a misleading definitive demand shortage;
3. demand date query validation accepts impossible calendar dates.

T011 is a narrow domain/service/API/planner/test/docs repair. Grocery and cooking integration remain blocked until another calculation review approves it.
