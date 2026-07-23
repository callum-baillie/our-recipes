# T089 NASEM adult energy-reference review

## Decision: approved with an explicit goal-series rule

All eight adult coefficients in T088 match NASEM 2023 Table 5-16, including age/height/weight units and the weight-stable EER boundary. The report and USDA materials support the four exact PAL labels and also require strong uncertainty wording: PAL classification is difficult, and the result is an estimate whose individual applicability varies. The initial adult 19+, non-pregnant, non-breastfeeding boundary is appropriate; child growth, gestational weeks/BMI-dependent deposition and postpartum/exclusivity inputs are deliberately unsupported.

The Worker must ignore the generic stored activity value and require a fresh exact PAL choice on every preview/apply. Reference sex category, birth date, height and current weight must come from the authorized server-loaded profile, not the request. Age is completed years on the effective date. The formula version, coefficient row, exact inputs, unrounded result, nearest-whole-kcal rule, effective date and DOI must remain in the response and versioned goal note.

Preview never mutates. Apply requires the current profile version and an operation UUID. If no current active `energy_kcal` goal exists, it may create a new reference series. If any current active energy goal exists, apply must require the exact latest goal version selected for supersession and use the existing append-only conflict contract; it may not silently replace or archive a manual goal. Exact operation retries return the same goal, while reuse with different evidence conflicts.

Approved files are a new pure energy-estimate domain module, new server service, new strict trusted-origin estimate route, the existing shared Nutrition error mapper only if needed, the profile Settings component/style, Nutrition page/dashboard only for effective-date wiring, and focused unit/service/API/component tests. No schema/migration, numeric DRI table beyond the eight adult energy equations, FDA personalization, permission expansion, external request, Pantry/planner/recommendation change or unsupported life-stage calculation is allowed.

The exact GoalBuddy Judge exceeded the single 30-second wait and was interrupted. The PM performed the same source and implementation-boundary audit as permitted fallback.
