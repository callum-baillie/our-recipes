# ADR 0003: Generated lists are copies, not plan mirrors

Meal plans reference canonical structured recipes by date and meal. Generating a shopping list always creates a new persistent list for the selected week; it never overwrites an existing editable list.

Numeric quantities are scaled by planned servings when the recipe yield starts with a number, then combined only across equal unit, ingredient, and note values. Rows retain source recipe IDs. Items without a numeric quantity remain separate so the list never invents a measurement.

Household edits—checking, reordering, removing, or adding list items—are durable. A user who wants a newly derived list creates another transparent copy instead of losing prior changes.
