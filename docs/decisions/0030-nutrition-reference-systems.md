# 0030: Separate Nutrition reference systems from personal goals

## Status

Accepted.

## Context

Nutrition needs multiple kinds of reference values. FDA Daily Values support standardized food-label context. National Academies Dietary Reference Intakes include RDA, AI, EAR, UL, AMDR, and CDRR values that differ by age, sex, life stage, source scope, and report year. Treating those systems as one interchangeable “daily goal” would be misleading.

## Decision

The domain models a versioned reference set with:

- an exact publisher/title/URL/version/retrieval citation;
- a reference system and purpose;
- age, sex, pregnancy, and lactation applicability;
- amount, range, percent-energy range, or explicitly not-established values;
- distinct DV/RDA/AI/EAR/UL/AMDR/CDRR kinds;
- a semantic and source scope, including UL scope;
- a general-information disclaimer.

The first numeric set is the FDA table for adults and children 4 years and older, retrieved from the FDA Daily Value reference page on 2026-07-18. It is always labeled `label_reference` and cannot validate as a personalized DRI. Numeric DRI rows remain deferred until their report-specific tables and footnotes receive a dedicated review.

FDA rows for chloride, chromium, molybdenum, and niacin equivalents expose gaps in the existing canonical food-nutrient catalog. The reference layer names those gaps without aliasing them to another nutrient. Persisted canonical expansion waits for the migration review.

Estimated energy remains unavailable unless the person explicitly consents and supplies required inputs. Even then, the result is labeled estimated with method/version disclosure; no formula in this package diagnoses need or supplies a medical prescription.

## Consequences

- UI and goal services can show exactly which authority, category, and life stage a value represents.
- FDA label percentages cannot silently become a personal RDA or UL.
- Missing reference values and unsupported nutrient forms remain visible.
- A later migration must version persisted reference rows and resolve canonical gaps before these values are stored.
