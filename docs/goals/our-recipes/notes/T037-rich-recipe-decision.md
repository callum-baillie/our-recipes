# T037 — Rich recipe and personal-preference decision

## Decision

Select T038: a coherent rich recipe-card and per-profile preference package. The current core supports structured ingredients/instructions, tags, source name/URL, favorites, cook history, revisions, and generic notes, but does not meet several explicit recipe-model and household requirements: original author/canonical source/cooking method, equipment, user-supplied nutrition, per-profile rating, per-profile recipe notes, or a portable Markdown export.

T038 will add those first-class, bounded fields with an additive migration, preserve existing favorites/history, put shared metadata on the recipe revision graph, keep personal ratings/notes profile-scoped, expose them through the versioned API, and provide reviewable recipe-card/editor UI and a deterministic Markdown download. It requires no provider, outbound request, external image, or Docker host.

## Ranking

1. **T038 selected — rich recipe/personal-preference core.** It closes high-value acceptance criteria on the product’s central object, gives household profiles the missing personal layer, and creates a durable base for deterministic import/export mappings.
2. **Mock-first AI provider deferred.** The required credential-gate check found no usable `OPENAI_API_KEY`; the user’s rule requires an explicit credential decision before implementing/configuring an API-calling path. A key would still not authorize a paid live request.
3. **OCR and richer document formats deferred.** They require a model/runtime, bounded-performance evidence, and handwritten fixtures rather than a pretend local capability.
4. **Docker/Unraid proof remains external.** The image/configuration exists, but a daemon and mounted-volume host proof are unavailable here.
5. **Final audit remains premature.** The full acceptance matrix still needs rich recipe, provider, and operational packages plus final visual/performance evidence.
