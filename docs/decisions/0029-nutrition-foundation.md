# 0029: Normalized append-only Nutrition foundation

## Status

Accepted.

## Context

Recipes historically expose eight optional, mutable nutrition fields. The integrated Nutrition feature needs a much broader nutrient catalog, source provenance, product-level data, recipe calculations, confidence/completeness, and historical intake snapshots. Pantry now supplies a stable canonical product and ingredient-mapping seam, but physical batches represent availability rather than consumption.

## Decision

Migration `0016_nutrition_foundation.sql` adds:

- a canonical 46-code nutrient definition catalog;
- explicit Nutrition data sources with citation and selection priority;
- append-only product nutrition records and sparse nutrient values;
- immutable calculation-version identities;
- append-only recipe calculation revisions, contribution evidence, and sparse total values.

Product and recipe services allocate monotonically increasing revisions inside a transaction. After the first record, an append must explicitly supersede the latest revision. Earlier rows and their values are never updated. Preferred product data is selected by source priority and then revision recency, retaining all alternative evidence.

The migration snapshots recipes with any legacy nutrition field under the low-priority `legacy_recipe_fields` source and `legacy_recipe_fields_v1` calculation version. The legacy columns remain in place for compatibility. Their values are partial recipe evidence, not product facts.

The schema records serving weight, density, and piece weight only as explicit evidence; it never invents count/mass/volume conversions. Recipe contribution rows store yield and retention inputs or an explicit missing-data reason. Pantry batches and meal plans do not create intake.

## Consequences

- Historical product and recipe calculations are explainable and can be copied into immutable future intake snapshots.
- Missing nutrients remain absent rows rather than zeroes.
- Reference values, provider adapters, private profile persistence, goals, intake, HTTP routes, and UI remain separate reviewed packages.
- Definitions and source citations can evolve without rewriting calculation history.
- Storage grows by revision; later maintenance may archive derived caches, but must not mutate recorded facts or intake snapshots.
