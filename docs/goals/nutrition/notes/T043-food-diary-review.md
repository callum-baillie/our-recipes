# T043 Food Diary review

## Decision: approved

T042 passes its calculation, history, privacy, authorization, accessibility, and full-gate boundary. Product totals are chosen and scaled server-side from an immutable food record; product corrections deliberately retain that original record after newer source revisions exist. Manual values remain explicitly user-entered while confidence, completeness, source identity, and estimated state are server-owned. Recipe corrections rescale a selected immutable calculation. All corrections/deletions remain latest-only and append-only, preserve source type, and require audit reasons; deleted rows contain no values or active source links. The dashboard receives only display and correction fields, not principal IDs, provenance snapshots, or source details.

The largest safe next package is normalized recipe presentation and edit-triggered recalculation for recipes that already have a normalized calculation. The recipe detail should show total/per-serving normalized values, quality, warnings, source and staleness separately from the existing legacy/imported/AI columns. Recipe library cards should show concise normalized calories/protein/fiber/sodium only when current and available. A successful ingredient/serving edit should attempt a new immutable calculation revision without rolling back or falsely failing the already-committed recipe edit; missing evidence must surface as unavailable/stale, not zero. Existing consumed snapshots must remain tied to their old calculation.

Pantry T022 is read-only, so no active write ownership overlaps this package. The recipe files are already dirty from prior Pantry/user work and require narrow patches that preserve every existing card, reaction, availability, actor, origin, and revision behavior. Rendered browser evidence remains a later isolated gate.

The exact GoalBuddy Judge exceeded the single-wait limit. The PM performed the same read-only approval gate as permitted fallback.
