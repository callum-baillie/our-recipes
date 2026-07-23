# ADR 0028: Canonical Pantry products, physical batches, and immutable events

## Status

Accepted.

## Decision

Model Pantry inventory as a canonical product catalog plus distinct physical batches. Products own normalized names, aliases, default units/storage, shelf-life hints, and optional staple thresholds. Batches own the actual quantity or explicit approximate state, location, package information, dates, lifecycle status, source links, and an optimistic version.

Inventory management extends this model without another table. A split or combine is a paired, atomic batch mutation whose immutable events carry a bounded pair reference. Both versions are checked, only compatible exact quantities may move, combine rejects differing storage/expiry metadata, and undo compensates both sides. The UI labels use-by, best-before, sell-by, estimated, and opened-shelf-life dates as recorded facts rather than food-safety guarantees.

Keep all persistence and stock arithmetic server-side. Inventory units belong to one of count, mass, or volume; conversion never crosses dimensions or assumes density. Recipe ingredient mappings are additive links that preserve the recipe ingredient row and the signed `ActorContext` attribution seam.

Record every batch mutation as an immutable event in the same transaction. Events store actor attribution, reason, optional related recipe/meal/list identifiers, and bounded before/after mutable state. Undo appends a compensating event and links it to the reversed event. First-expiring-first deductions select only active batches with exact compatible quantities.

## Consequences

The catalog can grow independently from stock, and multiple packages of one food retain their real differences. Approximate stock stays useful without contaminating exact shortage calculations. Stale tabs receive a conflict instead of silently overwriting a newer batch. History remains auditable after undo. Future availability, projected demand, grocery, and cooking integrations can use the mapping and provenance seams without collapsing recipes, planned demand, grocery intent, and on-hand stock into one mutable record.
