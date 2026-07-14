# 0012 — Reuse normalized recipe photos for curated collection covers

## Decision

Implement collections as a separate, additive organization graph: a canonical collection row has a manual shelf position, and `collection_recipes` holds ordered many-to-many membership. A cover may reference only a normalized local photo belonging to a recipe currently in that collection.

## Rationale

Collections are household cookbooks rather than recipe content. Keeping them out of the recipe revision graph lets members arrange seasonal, family, and practical shelves without manufacturing a new version of every recipe. Reusing existing normalized recipe photos fulfills the cover need without widening the proven image-upload boundary or adding a remote-image path.

## Consequences

- A recipe may appear in multiple collections, each with its own membership order.
- Creating, editing, ordering, or deleting a collection never edits or deletes a recipe. Deleting a collection cascades only its membership rows.
- Cover selection is validated against current membership. Removing the covered recipe/photo clears the collection cover, avoiding stale media references.
- The collection library filter joins through membership only; collection names are not silently folded into recipe full-text search.
- Keyboard-reachable up/down controls provide the initial accessible manual-order mechanism. Drag-and-drop remains a separate enhancement rather than a requirement for reliable ordering.
