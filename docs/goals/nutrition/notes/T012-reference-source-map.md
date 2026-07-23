# T012 authoritative Nutrition reference-source map

Accessed: 2026-07-18 (America/Los_Angeles)

Only primary U.S. government or National Academies sources were used. This receipt maps evidence; it does not approve a numeric dataset or medical recommendation.

## Source and version evidence

| Authority | Source | Version/date evidence | Supported use | Limits |
| --- | --- | --- | --- | --- |
| NIH Office of Dietary Supplements | **Nutrient Recommendations and Databases** — https://ods.od.nih.gov/healthinformation/nutrientrecommendations.aspx | Continuously maintained page; no page-level revision date exposed at access | Defines DRI, RDA, AI, EAR, and UL; says DRIs plan/assess intake of healthy people and vary by age/sex; links the National Academies reports and summary tables; explicitly distinguishes DVs | It is a routing/definition page, not a versioned machine-readable value set |
| National Academies | **Dietary Reference Intakes collection** — https://nap.nationalacademies.org/collection/57/dietary-reference-intakes | Report-specific editions from 1997 onward; latest relevant reports include Sodium and Potassium (2019) and Energy (2023) | Canonical report/version provenance for nutrient reference values and calculation methods | Different nutrients come from different report years; one global “DRI version” would be false |
| National Academies | **Dietary Reference Intakes for Sodium and Potassium, Appendix J** — https://www.nationalacademies.org/read/25353/chapter/28 | 2019, DOI 10.17226/25353 | Consolidated EAR, RDA/AI, water/macronutrient, AMDR, CDRR, and UL tables with life-stage rows | Tables must retain footnotes, units, sex/age/life-stage applicability, and absence of a value |
| USDA National Agricultural Library | **DRI Calculator for Healthcare Professionals** — https://www.nal.usda.gov/human-nutrition-and-food-safety/dri-calculator | Live tool at access; page says it represents current scientific knowledge | Evidence that individual estimates depend on age, sex, height, weight, activity, pregnancy and breastfeeding status | It warns individual requirements may be higher or lower; the app must not scrape or present the calculator as medical advice |
| FDA | **Daily Value on the Nutrition and Supplement Facts Labels** — https://www.fda.gov/food/nutrition-facts-label/daily-value-nutrition-and-supplement-facts-labels | Current FDA reference page at access; underlying regulatory authority is 21 CFR 101.9 | Current adult/children 4+ label DVs and unit conventions; %DV definition; 5%/20% low/high label guide | DV is a labeling reference, not a personalized RDA/AI or UL; separate FDA life-stage tables exist for infants, children 1–3, pregnancy/lactation |
| eCFR / FDA | **21 CFR 101.9 — Nutrition labeling of food** — https://www.ecfr.gov/current/title-21/chapter-I/subchapter-B/part-101/subpart-A/section-101.9 | Current electronic regulation at access | Legally current nutrient names, label calculations and rounding; permits general 4/4/9 kcal/g factors for protein/carbohydrate/fat and specific alternatives; defines sugar-alcohol factors | The simple domain fallback is an estimate, not equivalent to label compliance; alcohol needs its documented specific factor/evidence and label rules have rounding/definition detail |
| USDA FoodData Central | **Data Type Documentation** — https://fdc.nal.usda.gov/data-documentation/ | Live documentation at access | Separates Foundation (analytical USDA), Experimental (published research), FNDDS (compiled survey), Branded (manufacturer label), and SR Legacy sources | Source type materially changes confidence and update cadence; records must retain FDC type, ID, publication/update date, and derivation metadata |
| USDA FoodData Central | **Downloadable Data** — https://fdc.nal.usda.gov/download-datasets/ | April 2026 Foundation/Branded/full releases; FNDDS 2021–2023 released October 2024; SR Legacy final April 2018 | Exact dataset-release provenance and offline import option | Releases change; imported data must pin release, not claim to remain current automatically |
| USDA FoodData Central | **Inventory and Update Log** — https://fdc.nal.usda.gov/log/ | Version 15.2 dated June 25, 2026 at access | Current live service/update version evidence | Live API data may be newer than an April download, so source version and retrieval time are both required |
| USDA FoodData Central | **API Guide** — https://fdc.nal.usda.gov/api-guide/ | Live guide; linked OpenAPI is 1.0.1 | REST search/detail contract, data.gov key requirement, secret-handling duty, default 1,000 requests/hour/IP | No integration may expose the key or run without credential/config gates; this Scout made no API call |
| USDA FoodData Central | **API licensing** — same API Guide | Current at access | FDC data are public domain, published under CC0 1.0; USDA requests source attribution | Attribution should be retained even though permission is not required |

## Semantic and unit coverage

- RDA: target-like adequacy value for an individual healthy population group; it is not a minimum threshold that diagnoses deficiency.
- AI: target-like assumed adequacy when evidence cannot establish an RDA; UI must label it AI rather than silently calling it RDA.
- EAR: primarily a population/group assessment value and not the default personal goal.
- UL: limit semantic, but it is an intake level unlikely to cause harm, not a guaranteed toxicity threshold. Some ULs apply only to supplements/fortified sources; source-scope footnotes must be modeled.
- AMDR: range semantic expressed as percent of energy, requiring energy context and life-stage applicability.
- CDRR: risk-reduction intake used by specific reports (not interchangeable with UL or RDA).
- FDA DV: general label reference used for %DV. Store it as a distinct reference system and life-stage category, never as a personalized DRI.
- Units must preserve `g`, `mg`, `mcg`, `kcal`, `kJ`, `mcg RAE`, `mcg DFE`, niacin equivalents, and report-specific footnotes. Conversions between IU and mass or between folate/vitamin-A forms are nutrient/form-specific, not generic unit scaling.
- The canonical nutrient model currently lacks chloride, chromium, molybdenum, niacin-equivalent specificity, and nutrient-form/source-scope fields needed for full FDA/DRI coverage. These are explicit gaps, not zeroes.

## Demographic and life-stage boundaries

Reference applicability needs inclusive/exclusive age bounds, sex category used by the source, pregnancy/lactation stage, and sometimes body weight or energy/activity inputs. Infants, children 1–3, adults/children 4+, older children/adolescents, pregnancy, and lactation must not inherit an adult default silently. Energy estimates are materially more input-dependent than fixed micronutrient table lookups.

Household Nutrition profiles may store these inputs only with consent and server-side privacy authorization. The ordinary selected household profile is attribution, not permission to view or edit sensitive Nutrition values.

## Required product language

- “For general nutrition information, not medical advice.”
- “Reference values describe healthy population groups; individual needs may differ.”
- “Estimated” wherever inputs, source data, conversions, retention, serving weight, or energy factors are incomplete.
- Show the reference system/type, life-stage category, source title/version/date, units, and accessible explanation beside target/limit/range displays.
- Never diagnose deficiency, toxicity, disease risk, eating disorders, pregnancy needs, or weight-loss prescriptions.
- Do not label an amount “safe” merely because it is below a UL, and do not imply harm merely because a single day exceeds it.

## Unresolved Judge inputs

1. Whether to extend the canonical nutrient codes now for chloride/chromium/molybdenum and explicit nutrient equivalents/forms.
2. Whether the first shipped target dataset should be FDA DV only, a selected adult DRI subset, or both as separately selectable systems.
3. How to version report-specific rows and footnotes when different nutrients have different report years.
4. Whether energy estimation should ship only behind explicit consent and required-input completeness, leaving a manual target as the default.
5. The exact source-specific UL scope representation (all intake versus supplements/fortified food) and absent-value semantics.
