# AI defaults, context, and Decisions

## Implemented

All six text and vision workloads default to `gpt-6-luna`. Image creation retains `gpt-image-2`. Each workload remains independently configurable in Settings → AI, including custom model IDs and reasoning effort. A button stages recommended Luna settings; Save applies them. Migration 0060 only updates untouched legacy defaults (version 1, unchanged timestamps, matching previous model and effort). Customized settings remain intact.

Chat starts with focused permitted preferences and household planning scope. It reads the relevant current recipes, plans, shopping, Pantry or Nutrition evidence through bounded tools as needed, rather than attaching a broad private-record snapshot to every question. Explicit sharing controls still apply. Pantry sharing defaults off. Personal metrics and weight retain their separate gates; mass metrics require both permissions. Latest recorded measurements include time, source and approximate status. Locally calculated body-composition estimates are not presented as measured facts. See [AI execution and recovery](refinement/ai-system.md) for current prompt/model controls, real streaming and reviewed dependencies.

Context has bounded recipe, pantry, list and item counts with coverage metadata. Unknown or withheld data must not be treated as zero. Instructions distinguish people, recorded facts and estimates. These instructions improve grounding but cannot guarantee model correctness. This update makes no live provider calls and does not change the configured key.

## Decisions: recommended next applications

1. **Shopping item matching:** use a choice question over a short candidate product list, plus an explicit “no match” option. Supply name, brand, variant, quantity and unit. Keep exact barcode matches deterministic. Show ambiguous results for review; never let a classification silently change stock or select a different dietary variant.
2. **Recipe ranking for planning:** score already eligible recipes against supplied preferences, available ingredients, time and variety. Apply dates, profile selection, exclusions and known allergy constraints in application code first. A model score is not an allergen-safety check.
3. **Import review:** flag missing quantities, ambiguous servings, or non-recipe content for user review. Preserve the original source and allow correction.

Use Responses for chat, recipe creation and narrative explanations. Keep nutrition arithmetic, unit conversion, authorization and inventory mutations in deterministic application code.

Decisions is a separate public-beta API and currently supports GPT-6 Luna. It returns predicates, choices and rubric scores with probabilities, and can refuse. A future adapter should handle refusal, invalid candidate IDs, uncertainty and provider failures without committing changes. The documented JavaScript SDK requires 7.30.0 or later; this app currently uses 6.46.0, so integrating the endpoint requires an SDK upgrade or an isolated server-side HTTP adapter. Keep its enablement separate from general custom model selection. Evaluate thresholds against reviewed examples rather than inventing a universal confidence cutoff.

**Update:** the follow-up implementation now provides user-triggered Decisions reviews and store-map assistance. See [Kitchen decision assistance](decision-assistance.md) for implemented tasks, cache and correction behavior, consent and limitations. No live provider evaluation was performed during implementation.

## Official references

- [GPT-6 Luna capabilities and pricing](https://developers.openai.com/api/docs/models/gpt-6-luna): standard input $0.10 and output $0.50 per million tokens, checked October 15, 2026. Local cost previews remain approximate; legacy model prices retain their previous reference date.
- [Decisions guide](https://developers.openai.com/api/docs/guides/decisions)
- [Create a decision](https://developers.openai.com/api/reference/resources/decisions/methods/create)
