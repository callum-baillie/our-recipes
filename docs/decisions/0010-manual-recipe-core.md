# 0010 — Complete the manual recipe core before document or AI ingestion

## Decision

Add the rich manual recipe fields and lifecycle as an additive SQLite migration, then complete the editor and library with revision-protected writes. Keep user-entered draft recovery only in browser local storage and retain the current profile-cookie attribution boundary.

## Rationale

The persisted graph already supported multiple ordered ingredient and instruction sections, but the old interface exposed one of each. This was a direct release gap and can be safely completed without accepting a new untrusted file type, calling a paid provider, or requiring unavailable Docker operations.

## Consequences

- Recipes have `active`, `archived`, and `trash` lifecycle states plus rest time, difficulty, cuisine, category, tips, and shared notes.
- A write must include `expectedRevision`; stale browser tabs receive a conflict instead of overwriting a newer revision.
- The recipe list is server-paginated with SQLite-backed bounded facets and sort choices. Favorites/history are evaluated only for the selected profile.
- Keyboard-reachable move buttons are the accessible ordering mechanism in this package. A drag-and-drop enhancement remains separate from the data/API contract.
- Browser recovery drafts are never sent to the server until the cook explicitly saves the recipe.
