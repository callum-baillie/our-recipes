# 0018 — Planning entries and aisle-grouped shopping lists

- Status: accepted
- Date: 2026-07-13

## Context

Household planning needs to cover the way a real week is written: some meals
are saved recipes, while others are simple plans such as leftovers, takeout,
or a snack. Shopping lists must remain durable editable copies of a plan, but
people also need to see rows in the order they move through their own store.

## Decision

- A meal-plan entry has one of two bounded sources: a current saved recipe ID
  or a free-form title. It accepts breakfast, lunch, dinner, and snack. The
  validator requires at least one source; the UI presents the choice
  explicitly. Recipe-linked rows retain normal traceability, while free-form
  rows never cause an invented shopping ingredient.
- Copying a week creates independent rows for a destination week and does not
  mutate the source. Calendar export is a deterministic local ICS response for
  an inclusive date range, with no third-party calendar integration.
- `shopping_aisles` is a household-level, ordered catalog. Shopping rows hold
  an optional aisle ID. The list UI renders each configured aisle in its saved
  order plus a named **Unassigned** group, preserves editable/checkable rows,
  and reorders rows within their visible group.
- Deleting an aisle clears affected row assignments rather than deleting food
  data. Existing shopping lists remain independent generated copies: changing
  a plan or its aisle catalog never regenerates or overwrites them.

## Consequences

The API and UI expose explicit copy, ICS, and aisle CRUD/order contracts. All
mutations retain the existing trusted-origin and active-profile boundaries;
dates, titles, item fields, and aisle names/order are validated before service
writes. Browser proof covers a recipe meal, a free-form snack, ICS content,
week copying, aisle assignment, and visible group membership. Integration
proof covers the durable domain behavior.
