# T088 personalized energy source and equation map

Accessed 2026-07-19. This is a read-only source map; it does not implement or apply a target. Only primary National Academies and USDA sources were used.

## Authoritative evidence

| Evidence | Exact support | Product boundary |
| --- | --- | --- |
| [NASEM, Dietary Reference Intakes for Energy (2023), Chapter 5, Table 5-16](https://www.nationalacademies.org/read/26818/chapter/7) | Adults 19+ use sex-category-specific total-energy-expenditure prediction equations by four PAL categories. Age is years, height centimeters, weight kilograms, output kcal/day. For weight-stable adults TEE represents EER. DOI 10.17226/26818. | Initial implementation may support adults 19+ only. It estimates weight-maintenance energy; it must not add a loss/gain prescription. |
| [NASEM Chapter 7 applications](https://www.nationalacademies.org/read/26818/chapter/9?page_hash=154) | Choose the age/sex/PAL equation and insert age, height and weight. The committee says accurate individual PAL classification is extremely challenging and readily accessible measures have weak associations with measured PAL. | PAL must be an explicit user choice with uncertainty disclosure, never inferred from diary, steps or recipes. |
| [USDA NAL DRI Calculator](https://www.nal.usda.gov/human-nutrition-and-food-safety/dri-calculator) | USDA describes current DRI-based calorie estimates, warns individual requirements may be higher or lower, and requests age, height, weight, sex category, life stage and one of Inactive/Low Active/Active/Very Active. | Confirms input vocabulary and disclaimer. The live calculator is not scraped and is not the numeric source of truth. |
| [USDA activity-level explanation](https://www.nal.usda.gov/human-nutrition-and-food-safety/dri-calculator/modal-activity) | Defines the four adult activity categories relative to activities of daily living and example weekly activity. | UI must present these exact categories/descriptions for a fresh explicit choice. Existing generic activity values must not silently select a category. |

## Exact initial equation matrix

For age `A` in completed years, height `H` in centimeters and current weight `W` in kilograms, Table 5-16 gives:

| Source sex category | PAL category | EER kcal/day |
| --- | --- | --- |
| M | Inactive | `753.07 - 10.83A + 6.50H + 14.10W` |
| M | Low active | `581.47 - 10.83A + 8.30H + 14.94W` |
| M | Active | `1004.82 - 10.83A + 6.52H + 15.91W` |
| M | Very active | `-517.88 - 10.83A + 15.61H + 19.11W` |
| F | Inactive | `584.90 - 7.01A + 5.72H + 11.71W` |
| F | Low active | `575.77 - 7.01A + 6.60H + 12.14W` |
| F | Active | `710.25 - 7.01A + 6.54H + 12.34W` |
| F | Very active | `511.83 - 7.01A + 9.07H + 12.56W` |

The source labels are M/F categories used by its equations; they are not inferred gender identity. The app's existing `referenceSexCategory` is compatible only when explicitly supplied. The initial result should retain the unrounded calculation internally and present/apply a nearest-whole-kcal estimate with the rounding rule disclosed.

## Supported first boundary

A schema-free first implementation is supportable only when all of these are true:

- explicit estimator enablement and consent remain current;
- the requester can manage both the private profile and goals;
- effective-date age is 19 years or older;
- date of birth, canonical height, current weight and reference sex category are present;
- explicit life stage is neither pregnancy nor breastfeeding;
- the apply/preview request contains a fresh exact `inactive`, `low_active`, `active` or `very_active` selection and the UI displays USDA's category explanation before submission;
- the current profile version is supplied and rechecked.

Children/adolescents and pregnancy/lactation are excluded from the first package. Although NASEM publishes their equations, pregnancy needs gestational weeks and BMI-dependent energy deposition; lactation needs postpartum/exclusivity detail; these are not modeled. Child equations add age/sex-specific growth energy and require a separately reviewed boundary. Generic stored `activityLevel` values—including legacy `moderate`—must not be silently translated.

## Exact schema-free Worker proposal

Add a pure `nutrition-energy-estimate` domain module containing only the eight adult coefficients, completed-age boundary, finite positive input checks, exact PAL enum, nearest-kcal display value, source ID/version/DOI and neutral disclosure. Add a server service that reauthorizes `manage_profile` and `manage_goals`, loads profile inputs, rechecks expected profile version/consent/adult/non-life-stage constraints and provides preview plus explicit apply. Applying creates a versioned `energy_kcal` reference target through existing goal persistence, with exact source ID, formula inputs/category/effective date/rounding in the note. It must never overwrite a manual goal implicitly; UI must name the coexistence and require a separate explicit choice before changing any current goal series. An operation UUID must make an identical apply retry idempotent and conflicting reuse explicit.

Add a strict trusted-origin endpoint and a Settings estimate panel with fresh PAL selection, formula/source disclosure, preview, explicit confirmation and manual-goal alternative. Allowed implementation surfaces should be limited to a new pure domain module, new server service/route, existing Nutrition API error mapping if necessary, Settings component/styles, page/dashboard only if data wiring requires it, and focused unit/service/API/component tests. No schema/migration, FDA-DV personalization, reference scraping, automatic weight goal, Pantry/planner/recommendation or external-provider change is justified.

Required tests: all eight published equations; birthday/adult cutoff; missing/invalid values; pregnancy/lactation rejection; no mapping from generic activity; consent and dual authorization; profile-version conflict; preview non-mutation; apply source/note/version fidelity; exact retry and conflicting operation-key reuse; manual goal preservation; trusted origin/strict input; neutral accessible disclosure.

Refresh policy: pin the source as `nasem-eer-2023-table-5-16`, DOI `10.17226/26818`, retrieved `2026-07-19`. Never silently change a historical estimate. A future source review must add a new formula version and explicit re-apply workflow.

The exact GoalBuddy Scout exceeded the single 30-second wait and was interrupted. The PM completed the same primary-source map as permitted fallback.
