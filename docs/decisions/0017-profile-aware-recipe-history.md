# 0017 — Project profile preferences into recipe discovery and restore snapshots append-only

## Status

Accepted — 2026-07-13

## Context

Recipes are shared, while favorites, ratings, and notes belong to one selected household profile. The product also stores revision snapshots but previously offered no way to inspect attribution or return to a trusted previous card without manually recreating it.

## Decision

Expose only the active profile’s rating and favorite state in the library/detail projections. Add `highest-rated` as **Your highest rated**: its SQL subquery is keyed by the active profile and ties fall back to updated time. No score is averaged, persisted on `recipes`, or exposed for another profile.

Read creator, last-editor, and revision-editor display names with the shared detail projection. The history UI requires an explicit confirmation before posting a source revision plus `expectedRevision`. The service reparses the immutable saved snapshot through the current recipe schema and calls the normal optimistic update path, producing a new revision instead of mutating the source snapshot. Profile-private rows are not read from, changed by, or included in a restore.

## Consequences

Existing snapshots remain backward-compatible because the recipe schema supplies defaults for later additive fields. A stale restore returns the existing revision-conflict response. A future authenticated deployment can replace the selected-profile seam without changing the profile-scoped projection/query contract.
