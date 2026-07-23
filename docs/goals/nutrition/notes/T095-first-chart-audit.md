# T095 first individual-chart audit

Decision: approved.

The page is the authority for chart inputs: it supplies active-person/date scope, confirmed diary totals, a separately named planned projection, recent completeness, and latest goal versions to a pure dataset builder. The dashboard/component does not derive diary totals or combine planned and consumed values.

The calorie dataset preserves absent values as `null`, compares only confirmed energy, returns an explicit ambiguous state for multiple current energy goals, and retains range and limit boundaries rather than selecting a guess. Macro composition uses the existing calculated 4/4/9/7 distribution and remains incomplete unless protein, carbohydrate, and total fat are all present. Coverage rows preserve target/minimum value ratios, range bounds/status, limit remaining/above semantics, no-data values, and uncapped ratios alongside visually capped widths.

All three panels expose titles, concise factual context, person/date scope, units, semantic text independent of color, table equivalents, and empty or incomplete states. Patterned calorie bars plus explicit labels and tables avoid a color-only meaning. Responsive CSS stacks panels and coverage rows and allows narrow table overflow. The overview contains two compact panels rather than a wall of charts.

The implementation stayed inside the T094 code/test scope. Verification passed with 16 focused tests, 197 unit tests, 114 integration tests, lint, TypeScript, focused formatting/diff checks, and a production build with only the pre-existing backup-service NFT trace warning. No browser, Docker, PWA, backup, Unraid, device, or external-provider behavior is inferred.

The next safe task is a read-only boundary map for additive versioned display preferences and the remaining individual chart aggregate/source inputs. It must resolve migration, authorization, validation, historical-goal context, query budget, measurement privacy, and accessible control boundaries before another broad Worker.
