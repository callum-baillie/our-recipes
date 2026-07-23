# 0031 — Pantry availability and projected demand

Status: accepted

## Decision

Recipe ingredient text remains authoritative recipe content. Pantry integration uses the existing optional `recipe_ingredient_product_mappings` row keyed by ingredient ID; manual writes retain signed-profile attribution and do not create recipe revisions.

Availability is a derived, serving-scaled calculation with three states:

- `ready` means compatible exact active stock covers every required mapped ingredient.
- `partial` means a known exact shortage exists and there is no uncertain stock that could change that conclusion.
- `unknown` means a mapping, quantity, unit, scalable recipe yield, or compatible exact measurement is unavailable. Approximate or incompatible stock is disclosed but never counted as exact.

Within one recipe calculation, required ingredients mapped to the same product draw from one compatible exact stock pool in stable recipe order. An ingredient explanation reports the exact pool available when its allocation is considered, so duplicate lines cannot each claim the full physical stock.

Projected demand considers recipe-linked meals in chronological order for a requested real ISO calendar-date range. Skipped, cancelled, and meals with completed linked cook sessions are excluded. Compatible requirements share one exact stock pool, and each physical batch is counted at most once. A line is `covered`, a definitive `shortage`, or `uncertain`. When exact stock is insufficient but approximate or unit-incompatible stock exists for the product, `shortageQuantity` is null and `uncertaintyReason` explains why no exact shortage can be claimed. Exact lines can identify projected remainder, the later meal date where stock becomes insufficient, earliest recorded expiry, and recorded expiry-before-meal conflicts. Those dates are planning context, not food-safety advice. The calculation is non-mutating: it neither reserves nor consumes Pantry stock.

## Consequences

Recipe cards can show a compact state, while recipe and cook views explain each ingredient. The planner can show total exact demand, exact stock, definitive shortages, uncertain shortage conclusions, and an explicit unknown-requirement list. Grocery recommendations and confirmed cooking deductions remain separate later decisions.

Meal-plan entries persist only `planned`, `skipped`, or `cancelled`. `cooked` remains derived from a completed linked cook session so duplicate state cannot drift. Status writes preserve trusted-origin and signed ActorContext attribution.
