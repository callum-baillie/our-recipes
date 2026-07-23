# 0032 — Persist grocery provenance and confirm cooking deductions

Status: accepted

## Decision

Store Pantry-derived grocery metadata beside the editable shopping row. A stable generation key reconnects each projected line during regeneration. Every definitive and uncertain snapshot includes its product, formula inputs, recipe ID, meal-plan entry, planned date, serving count, ingredient, and per-meal contribution; the shopping row also retains the distinct source recipe IDs. Field-level flags preserve later quantity, unit, item, and note edits in the same transaction as the row edit. Manual additions are never regeneration targets. An uncertain line always has a null generated quantity. When generated demand disappears, an edited row keeps only its user values and manual flags: source recipe IDs, formula/provenance JSON, uncertainty, generated unit, and generated/shortage numbers are cleared. Rendering also suppresses contributions for every obsolete-manual row.

Purchased-item intake requires an explicit Pantry product, physical location, and client-generated operation key. A synchronous per-item tracker stores the key before fetch dispatch, so concurrent clicks, rejected responses, and unknown network outcomes reuse the same shopping-item/operation-key pair. Only a confirmed successful response rotates the matching key; late responses for the prior key cannot rotate it again. A later distinct purchase therefore creates another batch. Batch creation, purchase attribution, and the inventory event share one transaction.

Starting a cook session may link a planned meal and returns a non-mutating Pantry preview. Completion requires literal confirmation of an adjustable exact-consumption list. Compatible exact deductions use FEFO and share one transaction with event links, the confirmation snapshot, optional recipe/meal-linked leftover batches, and cook completion. Approximate, missing, and incompatible demand is never inferred as exact.

Cooking undo uses append-only compensating events and succeeds only while each affected batch still has the cooking event as its newest event and its optimistic version is unchanged. Linked leftovers block automatic undo so later edits or consumed food cannot be silently erased. Inventory compensation and the cook-plan `undone` transition commit in one transaction; failure of either rolls back both, and a repeated undo conflicts.

## Consequences

- Recipe ingredient wording and availability formulas remain unchanged.
- Grocery regeneration remains explainable and preserves household judgment.
- A checked grocery item does not enter Pantry until location-aware intake is explicit.
- Merely reaching the end of cooking does not consume stock.
- Conflict responses favor review over plausible but unsafe restoration.

## Grocery formula and rich intake extension

The grocery row now retains missing/all mode, manual extra, explicit covered and purchased quantities, and covered/ignore-Pantry/inaccurate/reset controls. One compatible normalized unit is used for `max(0, max(recipe requirement, active threshold-triggered staple target) + manual extra - usable Pantry - purchased/covered)`. Grocery-excluded batches do not affect this formula but remain available to recipe planning. A purchase batch linked to this row is represented by purchased coverage and excluded from the row's usable-stock term, preventing double counting. Unsupported substitution is stated explicitly instead of introducing a new persistence model.

Purchase confirmation can record partial or complete coverage plus package count/size/unit, location and sublocation, purchase and expiry-related dates, precision, price cents, store/source, and notes. These values map to existing validated batch fields in the same idempotent transaction as attribution and grocery coverage.
