# 0014 — Standards-based JSON-LD portability is local and review-first

## Decision

Use Schema.org `Recipe` JSON-LD as the current portability boundary. A recipe card exports a deterministic local `application/ld+json` document. The import hub accepts only pasted JSON-LD (maximum 1 MB), discovers bounded Recipe candidates from a root object, an array, or an `@graph`, requires the household member to choose one candidate, exposes an editable recipe review, and creates a recipe only after explicit confirmation.

The mapping is deliberately modest and inspectable: name, description, yield, ISO 8601 prep/cook/total times, category, cuisine, keywords, source URL, ingredient lists, and HowTo sections/steps are mapped. Local images, actor attribution, household notes, tips, revisions, storage data, ratings, nutrition, and media are not exported or imported as household recipe data.

## Safety and retention

The parser never fetches a URL, accepts a JSON-LD file, archive, image, or multipart form, invokes an OCR/AI/provider service, or stores source text. It parses JSON only after a byte cap, performs a bounded root/`@graph` traversal, and validates the selected draft through the normal recipe schema. Candidate discovery and review data live only for the current request/browser interaction; confirmation is the only write.

## Consequences

The format is useful for migration and sharing while preserving the product’s local trust boundary. It intentionally does not promise lossless export/import of every Recipe extension or every internal field. Later support for files, archives, remote fetch, or provider-assisted extraction requires a separate decision, limits, retention rules, and tests.

## References

- [Schema.org Recipe](https://schema.org/Recipe)
- [Schema.org recipeIngredient](https://schema.org/recipeIngredient)
- [Schema.org recipeInstructions](https://schema.org/recipeInstructions)
