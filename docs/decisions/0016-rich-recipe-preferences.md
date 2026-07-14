# 0016 — Keep rich recipe-card fields shared and personal preferences separate

## Status

Accepted — 2026-07-12

## Context

The household needs enough card detail to reproduce a recipe: original author/source, cooking method, equipment, and nutrition values supplied by the household. It also needs individual ratings and notes without allowing one profile to overwrite another’s judgement or pollute a shared recipe revision/export.

## Decision

Add shared source/author/method and nutrition columns to `recipes`, and ordered equipment rows in `recipe_equipment`. They are parsed with the ordinary recipe input, written in the existing optimistic recipe transaction, and therefore included in immutable recipe snapshots. Nutrition is explicitly user-entered only; no estimator, provider, credential, or outbound call is introduced.

Store ratings and notes in `recipe_profile_preferences`, keyed by `(profile_id, recipe_id)`. The selected signed profile is required for writes and only that profile’s row is read into recipe detail. Saving or clearing this row does not change `current_revision`, the full-text index, shared card data, JSON-LD, or Markdown exports.

Markdown is a deterministic local rendering of the shared current card. It has a `text/markdown` attachment response, `no-store`, and `nosniff` headers.

## Consequences

Existing recipes receive nullable/empty rich fields through an additive SQLite migration. New card data is revisioned and duplicated with a recipe; private preferences are not duplicated, exported, or visible in profile-neutral reads. A future nutrition integration requires a separate capability, credential/paid-call review, threat-model update, and tests rather than changing these user-entered fields.
