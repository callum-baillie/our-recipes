# T044 — Browser verification threshold

T044 implementation is not complete because `pnpm test:e2e` reached the task’s two-failure stop threshold during the planner flow.

1. Adding a recipe/free-form radio fieldset made the former fuzzy `getByLabel('Recipe')` locator match both the radio and select.
2. Narrowing it to exact text failed because the browser calculates the select’s label as `RecipeChoose a recipe`, including its disabled placeholder option.

These failures occur before a plan mutation and do not indicate a migration, service, API, or security failure. `pnpm typecheck` and integration migration/service tests pass. A fresh Worker task may change the browser test to target the semantic `select[name="recipeId"]` control, then continue the full workflow proof. T044 must not retry browser verification under its own threshold.
