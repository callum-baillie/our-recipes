# T045 — Planner browser threshold review

## Decision: fresh test-only correction is safe

The first planner failure proves the radio and select controls are both rendered. The second proves the select’s actual computed label includes its placeholder option, so neither fuzzy nor exact label matching is a stable contract for this control. The route/schema/service did not run in either failure.

The test should use `select[name="recipeId"]`, which is the direct semantic form control submitted to the API and remains stable across visible label wording. T046 may make only that assertion correction, then run the entire fresh gate. If the workflow exposes any actual planner, free-form, calendar, duplicate-week, aisle, migration, origin, or accessibility defect, it must return to a Judge rather than change product behavior under the narrow task.
