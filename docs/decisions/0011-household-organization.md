# 0011 — Govern shared tags without turning profiles into accounts

## Decision

Add a canonical `tags` catalog and an additive profile archival timestamp. Keep profile selection as a non-auth convenience layer. Maintain recipe-to-tag associations as normalized rows, and implement tag rename, merge, and delete as transactions that refresh affected full-text documents.

## Rationale

Recipe tags must remain useful to the whole household as the library grows. A canonical catalog gives colors, usage counts, autocomplete, and one place to resolve duplicates without changing a recipe’s content. Profiles already appear in attribution and personal cooking data, so deleting them would make history ambiguous; archiving is the reversible behavior that preserves it.

## Consequences

- Tag names are normalized to lower-case values with a bounded length. The browser’s autocomplete is advisory; services enforce normalization and conflicts.
- Renaming retains recipe links. Merging transfers the source links to a target tag and removes the source. Deletion detaches that tag from recipes without deleting a recipe.
- Tag changes refresh affected FTS documents inside the same operation so library search cannot retain stale tag text.
- A profile cannot archive itself while active, and the service refuses to archive the final active profile. Archived rows remain available for history and can be restored.
- Profiles remain preferences and attribution only. They do not add authentication, authorization, or a multi-tenant boundary.
