# T034 — Standards-based portability decision

## Decision

Select a complete generic JSON-LD Recipe portability package next. It will map the existing internal recipe graph to Schema.org `Recipe`, export a local recipe as `application/ld+json`, safely accept pasted JSON-LD including top-level and `@graph` recipe nodes, present a reviewable candidate, and create a recipe only after explicit confirmation.

## Ranking

1. **T035 selected — JSON-LD portability.** It fulfils an explicit interoperability requirement, is a coherent import/export vertical slice with no provider dependency, and lets future URL/document/AI candidate sources converge on a documented mapping.
2. **AI-provider boundary deferred.** The shell has no usable `OPENAI_API_KEY`; the credential-gate skill requires an explicit user decision before any API-backed work, and a key would not authorize a paid call. A mock-only boundary is valuable but should follow a shared candidate/portability mapping rather than introduce a second normalization shape now.
3. **Bundled local OCR deferred.** A real offline OCR package needs model assets, CPU/memory limits, retention policy, and handwritten-fixture evidence. Pretending that an unavailable model performs OCR would violate the review/import boundary.
4. **Docker/Unraid proof remains blocked on a daemon/host.** The artifacts are already present, but no daemon-backed persistence claim can be made here.
5. **Final release audit remains premature.** Significant acceptance work and external evidence are still open.

## T035 boundary

No archive, remote fetch, arbitrary file ingestion, provider/key access, paid request, or live external validation. JSON is bounded and parsed locally; only JSON-LD Recipe nodes are considered; unknown fields remain preserved as warnings/raw source rather than invented. Export is generated from the current local recipe graph. The confirmation route remains the only creation path.
