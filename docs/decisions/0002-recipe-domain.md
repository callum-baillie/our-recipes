# ADR 0002: Canonical structured recipe cards before capture

## Decision

The first recipe package stores manual recipes as normalized ordered ingredient groups, ingredients, instruction sections, steps, and tags. A `recipes` row represents the current shared card, while `recipe_revisions` stores an immutable JSON snapshot per save with the selected profile as creator/editor attribution. SQLite FTS5 indexes only the current searchable content.

## Rationale

Manual create/search/read/edit/revise is the smallest complete shared cooking workflow and creates the canonical model needed for later review-first import/capture. It avoids prematurely coupling the core model to unsafe remote fetches, uploads, OCR, AI normalization, or images.

## Consequences

Profiles remain non-auth actor labels. A recipe edit replaces the normalized current graph in one transaction, writes a revision snapshot, and refreshes its FTS document. The initial editor keeps one ingredient group and one method section approachable; the persisted model supports richer group/section editors in the next recipe refinement package.
